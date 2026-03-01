// src-tauri/src/backup_v2.rs
// ─────────────────────────────────────────────────────────────────────────────
// Encrypted vault backup export / import (.smartbackup format).
//
// Format: JSON wrapper with these fields:
//   {
//     "backup_version": 2,
//     "vault_name": "My Vault",
//     "created_at": "2025-01-01T00:00:00Z",
//     "entry_count": 42,
//     "checksum": "<hex SHA-256 of encrypted_blob>",
//     "salt": "<hex>",
//     "nonce": "<hex>",
//     "encrypted_blob": "<base64>"
//   }
//
// The encrypted_blob contains AES-256-GCM-encrypted JSON of all entries.
// If a backup password is provided, a fresh key is derived from it.
// Otherwise, the vault's own master password is used.
//
// SHA-256 checksum lets us detect corruption before attempting decryption.
// ─────────────────────────────────────────────────────────────────────────────

use crate::{crypto, db, state::VaultState};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, sync::Mutex};
use tauri::State;
use zeroize::Zeroize;

const BACKUP_VERSION: u32 = 2;
const SALT_LEN: usize = 32;
const NONCE_LEN: usize = 12;

// ── Backup file schema ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct SmartBackup {
    backup_version: u32,
    vault_name: String,
    created_at: String,
    entry_count: usize,
    /// Hex-encoded SHA-256 of the raw encrypted_blob bytes.
    checksum: String,
    /// Hex-encoded 32-byte Argon2id salt.
    salt: String,
    /// Hex-encoded 12-byte AES-GCM nonce.
    nonce: String,
    /// Base64-encoded encrypted blob (JSON → AES-256-GCM).
    encrypted_blob: String,
}

// ── Backup entry (plaintext inside encrypted blob) ─────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct BackupEntryV2 {
    id: String,
    service_name: String,
    username: String,
    email: String,
    password: String,
    category: String,
    notes: Option<String>,
    created_at: i64,
    updated_at: i64,
}

// ── Import result ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub imported: u32,
    pub vault_name: String,
}

// ── Hex helpers ────────────────────────────────────────────────────────────────

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn from_hex(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err("Invalid hex string length.".into());
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&hex[i..i + 2], 16)
                .map_err(|e| format!("Invalid hex at position {i}: {e}"))
        })
        .collect()
}

// ── Base64 helpers (reuse db module's or inline minimal) ───────────────────────

fn b64_encode(input: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut r = String::new();
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let t = (b0 << 16) | (b1 << 8) | b2;
        r.push(CHARS[((t >> 18) & 0x3F) as usize] as char);
        r.push(CHARS[((t >> 12) & 0x3F) as usize] as char);
        r.push(if chunk.len() > 1 { CHARS[((t >> 6) & 0x3F) as usize] as char } else { '=' });
        r.push(if chunk.len() > 2 { CHARS[(t & 0x3F) as usize] as char } else { '=' });
    }
    r
}

fn b64_decode(input: &str) -> Result<Vec<u8>, String> {
    db::base64_decode(input)
}

// ── Export ──────────────────────────────────────────────────────────────────────

/// Export the active vault as an encrypted `.smartbackup` file.
///
/// `backup_password`: if provided, a fresh key is derived from it to encrypt;
///     otherwise the vault's master encryption key is used with a fresh salt.
/// `vault_name`: the display name to embed in the backup metadata.
/// `file_path`: destination path chosen by the user via a save dialog.
#[tauri::command]
pub fn export_vault_backup(
    backup_password: Option<String>,
    vault_name: String,
    file_path: String,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<String, String> {
    // 1. Get the live vault key to decrypt entries
    let vault_key = {
        let guard = vault_state.lock().map_err(|_| "State lock poisoned.")?;
        guard.key()?.duplicate()
    };

    // 2. Decrypt all entries
    let entries = db::get_all_entries()?;
    let mut backup: Vec<BackupEntryV2> = Vec::with_capacity(entries.len());

    for entry in &entries {
        let raw = db::base64_decode(&entry.encrypted_password)
            .map_err(|e| format!("Base64 decode error ({}): {e}", entry.id))?;
        let password = crypto::decrypt_password(vault_key.as_bytes(), &raw)?;
        backup.push(BackupEntryV2 {
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

    let entry_count = backup.len();

    // 3. Serialize to JSON
    let mut json_bytes = serde_json::to_vec(&backup)
        .map_err(|e| format!("Serialisation failed: {e}"))?;

    // 4. Derive backup encryption key
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);

    let password_for_key = backup_password.unwrap_or_default();
    let backup_key = if password_for_key.is_empty() {
        // Use the vault key directly (copy) — still uses fresh salt+nonce for the backup blob
        vault_key.duplicate()
    } else {
        crypto::derive_key(&password_for_key, &salt)?
    };

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

    // 7. Compute SHA-256 checksum of the ciphertext
    let checksum = {
        let mut hasher = Sha256::new();
        hasher.update(&ciphertext);
        to_hex(&hasher.finalize())
    };

    // 8. Build the .smartbackup JSON
    let blob_b64 = b64_encode(&ciphertext);
    let timestamp = chrono::Utc::now().to_rfc3339();

    let backup_file = SmartBackup {
        backup_version: BACKUP_VERSION,
        vault_name,
        created_at: timestamp.clone(),
        entry_count,
        checksum,
        salt: to_hex(&salt),
        nonce: to_hex(&nonce_bytes),
        encrypted_blob: blob_b64,
    };

    let file_json = serde_json::to_string_pretty(&backup_file)
        .map_err(|e| format!("Serialisation error: {e}"))?;

    fs::write(&file_path, file_json)
        .map_err(|e| format!("Failed to write backup file: {e}"))?;

    Ok(timestamp)
}

// ── Import ─────────────────────────────────────────────────────────────────────

/// Import a `.smartbackup` file into the current vault.
///
/// `backup_password`: password used to encrypt the backup (empty = vault key was
///     used at export time).
/// `file_path`: full path to the `.smartbackup` file.
///
/// Returns the number of entries imported and the vault name from the backup.
#[tauri::command]
pub fn import_vault_backup(
    backup_password: Option<String>,
    file_path: String,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<ImportResult, String> {
    // 1. Read file
    let data = fs::read_to_string(&file_path)
        .map_err(|e| format!("Cannot read backup file: {e}"))?;

    let backup: SmartBackup = serde_json::from_str(&data)
        .map_err(|e| format!("Invalid .smartbackup format: {e}"))?;

    if backup.backup_version != BACKUP_VERSION {
        return Err(format!(
            "Unsupported backup version: {} (expected {BACKUP_VERSION})",
            backup.backup_version
        ));
    }

    // 2. Decode the encrypted blob
    let ciphertext = b64_decode(&backup.encrypted_blob)?;

    // 3. Verify SHA-256 checksum
    let actual_checksum = {
        let mut hasher = Sha256::new();
        hasher.update(&ciphertext);
        to_hex(&hasher.finalize())
    };
    if actual_checksum != backup.checksum {
        return Err("Backup integrity check failed — checksum mismatch.".into());
    }

    // 4. Decode salt and nonce
    let salt = from_hex(&backup.salt)?;
    let nonce_bytes = from_hex(&backup.nonce)?;
    if salt.len() != SALT_LEN || nonce_bytes.len() != NONCE_LEN {
        return Err("Invalid salt or nonce length in backup.".into());
    }

    // 5. Derive decryption key
    let vault_key = {
        let guard = vault_state.lock().map_err(|_| "State lock poisoned.")?;
        guard.key()?.duplicate()
    };

    let password_for_key = backup_password.unwrap_or_default();
    let decrypt_key = if password_for_key.is_empty() {
        vault_key.duplicate()
    } else {
        crypto::derive_key(&password_for_key, &salt)?
    };

    // 6. AES-256-GCM decrypt
    let cipher = Aes256Gcm::new_from_slice(decrypt_key.as_bytes())
        .map_err(|e| format!("Cipher init: {e}"))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let mut plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| "Decryption failed — wrong password or corrupted backup.".to_string())?;

    // decrypt_key auto-zeroized on drop (VaultKey)

    // 7. Deserialize entries
    let mut entries: Vec<BackupEntryV2> = serde_json::from_slice(&plaintext)
        .map_err(|e| format!("Corrupt backup data: {e}"))?;

    plaintext.zeroize();

    // 8. Re-encrypt entries with the current vault key and insert into DB
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

    Ok(ImportResult {
        imported,
        vault_name: backup.vault_name,
    })
}
