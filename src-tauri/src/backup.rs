// src-tauri/src/backup.rs
// ─────────────────────────────────────────────────────────────────────────────
// Encrypted vault backup export / import (.svault format).
//
// File layout (all fields big-endian):
//   [4 B]   magic:  "SVLT"
//   [2 B]   version: 0x0001
//   [32 B]  salt (Argon2id)
//   [12 B]  nonce (AES-256-GCM)
//   [rest]  ciphertext + 16-byte auth tag
//
// Encryption:
//   1. Derive a fresh 256-bit key from the master password + random salt
//      using Argon2id (same params as vault key derivation).
//   2. Serialise all vault entries to JSON.
//   3. AES-256-GCM encrypt the JSON with a random nonce.
//   4. Prepend header then write to disk.
//
// Decryption (import):
//   1. Read + verify header magic/version.
//   2. Extract salt and nonce.
//   3. Derive key from supplied master password + salt.
//   4. AES-256-GCM decrypt.
//   5. Deserialise JSON → Vec<BackupEntry>.
//   6. Re-encrypt each entry with the *current* vault key and insert into DB.
//
// Security:
//   • The export file is a single encrypted blob — no plaintext metadata.
//   • Temporary plaintext buffers are zeroized immediately after use.
//   • No unwrap() on crypto operations.
// ─────────────────────────────────────────────────────────────────────────────

use crate::{crypto, db, state::VaultState};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::{fs, sync::Mutex};
use tauri::State;
use zeroize::{Zeroize, Zeroizing};

// ── Constants ──────────────────────────────────────────────────────────────────

const MAGIC: &[u8; 4] = b"SVLT";
const VERSION: u16 = 1;
const SALT_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const HEADER_LEN: usize = 4 + 2 + SALT_LEN + NONCE_LEN; // 50 bytes

// ── Backup entry (what goes inside the encrypted blob) ─────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct BackupEntry {
    id: String,
    service_name: String,
    username: String,
    email: String,
    /// Plaintext password — only ever lives in memory briefly.
    password: String,
    category: String,
    notes: Option<String>,
    created_at: i64,
    updated_at: i64,
}

// ── Export ──────────────────────────────────────────────────────────────────────

/// Export the entire vault as an encrypted `.svault` file.
///
/// `master_password` is required to re-authenticate and encrypt the backup.
/// `file_path` is the full destination path chosen by the user via a dialog.
#[tauri::command]
pub fn export_vault(
    master_password: String,
    file_path: String,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<String, String> {
    let master_password = Zeroizing::new(master_password);
    // 1. Get the live vault key to decrypt entries
    let vault_key = {
        let guard = vault_state.lock().map_err(|_| "State lock poisoned.")?;
        guard.key()?.duplicate()
    };

    // 2. Decrypt all entries into BackupEntry structs
    let entries = db::get_all_entries()?;
    let mut backup: Vec<BackupEntry> = Vec::with_capacity(entries.len());

    for entry in &entries {
        let raw = db::base64_decode(&entry.encrypted_password)
            .map_err(|e| format!("Base64 decode error ({}): {e}", entry.id))?;
        let password = crypto::decrypt_password(vault_key.as_bytes(), &raw)?;

        backup.push(BackupEntry {
            id: entry.id.clone(),
            service_name: entry.service_name.clone(),
            username: entry.username.clone(),
            email: entry.email.clone(),
            password,
            category: entry.category.clone(),
            notes: entry.notes.clone(),
            created_at: entry.created_at,
            updated_at: entry.updated_at,
        });
    }

    // 3. Serialise to JSON
    let mut json_bytes = serde_json::to_vec(&backup)
        .map_err(|e| format!("Serialisation failed: {e}"))?;

    // 4. Derive a *separate* encryption key from the master password + fresh salt
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    let backup_key = crypto::derive_key(&master_password, &salt)?;

    // 5. AES-256-GCM encrypt
    let cipher = Aes256Gcm::new_from_slice(backup_key.as_bytes())
        .map_err(|e| format!("Cipher init: {e}"))?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, json_bytes.as_ref())
        .map_err(|e| format!("Encryption failed: {e}"))?;

    // 6. Zeroize sensitive buffers
    json_bytes.zeroize();
    // backup_key and vault_key auto-zeroize on drop (VaultKey)
    for entry in &mut backup {
        entry.password.zeroize();
    }

    // 7. Build the .svault file
    let mut file_data = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    file_data.extend_from_slice(MAGIC);
    file_data.extend_from_slice(&VERSION.to_be_bytes());
    file_data.extend_from_slice(&salt);
    file_data.extend_from_slice(&nonce_bytes);
    file_data.extend_from_slice(&ciphertext);

    fs::write(&file_path, &file_data)
        .map_err(|e| format!("Failed to write backup file: {e}"))?;

    // 8. Record timestamp
    let timestamp = chrono::Utc::now().to_rfc3339();
    Ok(timestamp)
}

// ── Import ─────────────────────────────────────────────────────────────────────

/// Import a `.svault` backup, decrypting with the supplied master password.
///
/// **Replaces** the current vault contents. The caller must confirm this
/// with the user before invoking.
#[tauri::command]
pub fn import_vault(
    master_password: String,
    file_path: String,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<u32, String> {
    let master_password = Zeroizing::new(master_password);
    // 1. Read file
    let data = fs::read(&file_path)
        .map_err(|e| format!("Cannot read backup file: {e}"))?;

    if data.len() < HEADER_LEN + 16 {
        // minimum: header + at least one AES-GCM tag
        return Err("File is too small or corrupt.".into());
    }

    // 2. Verify header
    if &data[0..4] != MAGIC {
        return Err("Not a valid .svault file (bad magic).".into());
    }
    let version = u16::from_be_bytes([data[4], data[5]]);
    if version != VERSION {
        return Err(format!("Unsupported backup version: {version}"));
    }

    // 3. Extract salt, nonce, ciphertext
    let salt = &data[6..6 + SALT_LEN];
    let nonce_bytes = &data[6 + SALT_LEN..6 + SALT_LEN + NONCE_LEN];
    let ciphertext = &data[HEADER_LEN..];

    // 4. Derive key
    let backup_key = crypto::derive_key(&master_password, salt)?;

    // 5. Decrypt
    let cipher = Aes256Gcm::new_from_slice(backup_key.as_bytes())
        .map_err(|e| format!("Cipher init: {e}"))?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let mut plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed — wrong password or corrupted file.".to_string())?;

    // backup_key auto-zeroized on drop (VaultKey)

    // 6. Deserialise
    let mut entries: Vec<BackupEntry> = serde_json::from_slice(&plaintext)
        .map_err(|e| format!("Corrupt backup data: {e}"))?;

    plaintext.zeroize();

    // 7. Get the *current* vault encryption key to re-encrypt entries
    let vault_key = {
        let guard = vault_state.lock().map_err(|_| "State lock poisoned.")?;
        guard.key()?.duplicate()
    };

    // 8. Delete existing entries, then insert new ones
    let existing = db::get_all_entries()?;
    for e in &existing {
        let _ = db::delete_entry(&e.id);
    }

    let mut imported = 0u32;
    for entry in &mut entries {
        let encrypted = crypto::encrypt_password(vault_key.as_bytes(), &entry.password)?;
        db::insert_entry(
            &entry.id,
            &entry.service_name,
            &entry.username,
            &entry.email,
            &encrypted,
            &entry.category,
            entry.notes.as_deref(),
            entry.created_at,
        )?;
        entry.password.zeroize();
        imported += 1;
    }

    Ok(imported)
}
