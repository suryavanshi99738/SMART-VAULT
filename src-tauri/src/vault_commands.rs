// src-tauri/src/vault_commands.rs
// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands for vault CRUD operations and password generation.
//
// Security model:
// • Every command that reads or writes encrypted data requires a live key
//   extracted from the Tauri-managed VaultState.
// • The key is obtained via state.key() which returns Err if the vault is
//   locked, ensuring no silent bypass is possible.
// • unlock_vault / lock_vault live in auth.rs — not here.
// ─────────────────────────────────────────────────────────────────────────────

use crate::{crypto, db, state::{VaultState, VaultKey}};
use rand::{seq::SliceRandom, thread_rng};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;
use zeroize::Zeroize;

// ── Request / response DTOs ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AddEntryRequest {
    pub service_name: String,
    pub username: String,
    pub email: String,
    pub password: String,
    pub category: String,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEntryRequest {
    pub id: String,
    pub service_name: String,
    pub username: String,
    pub email: String,
    pub password: Option<String>, // None means "keep existing encrypted blob"
    pub category: String,
    pub notes: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize)]
pub struct DecryptedEntry {
    pub id: String,
    pub service_name: String,
    pub username: String,
    pub email: String,
    pub password: String,
    pub category: String,
    pub notes: Option<String>,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/// Lock the vault state and extract the encryption key.
/// Returns an owned VaultKey copy that auto-zeroizes when dropped.
fn get_key(vault_state: &State<'_, Mutex<VaultState>>) -> Result<VaultKey, String> {
    let guard = vault_state
        .lock()
        .map_err(|_| "VaultState mutex poisoned.".to_string())?;
    Ok(guard.key()?.duplicate())
}

// ── Commands ───────────────────────────────────────────────────────────────────

/// Add a new password entry to the vault.
#[tauri::command]
pub fn add_password_entry(
    mut request: AddEntryRequest,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<String, String> {
    let key = get_key(&vault_state)?;

    let encrypted = crypto::encrypt_password(key.as_bytes(), &request.password)?;
    request.password.zeroize();

    let id = Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;

    db::insert_entry(
        &id,
        &request.service_name,
        &request.username,
        &request.email,
        &encrypted,
        &request.category,
        request.notes.as_deref(),
        now,
    )?;

    Ok(id)
}

/// Update an existing password entry.
/// If `request.password` is `Some`, the new plaintext is re-encrypted.
/// If `None`, the encrypted blob already stored in the DB is preserved by
/// reading the current entry first and re-writing the same bytes.
#[tauri::command]
pub fn update_password_entry(
    mut request: UpdateEntryRequest,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    let key = get_key(&vault_state)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;

    // Determine the encrypted bytes to store
    let encrypted: Vec<u8> = if let Some(ref plaintext) = request.password {
        crypto::encrypt_password(key.as_bytes(), plaintext)?
    } else {
        // No new password supplied — preserve the existing ciphertext
        let entries = db::get_all_entries()?;
        let entry = entries
            .iter()
            .find(|e| e.id == request.id)
            .ok_or_else(|| format!("Entry '{}' not found.", request.id))?;
        db::base64_decode(&entry.encrypted_password)
            .map_err(|e| format!("Base64 decode error: {e}"))?
    };

    // Zeroize plaintext password if present
    if let Some(ref mut pw) = request.password {
        pw.zeroize();
    }

    db::update_entry(
        &request.id,
        &request.service_name,
        &request.username,
        &request.email,
        &encrypted,
        &request.category,
        request.notes.as_deref(),
        now,
    )
}

/// Return all vault entries (password field is still encrypted / base64).
/// Vaults may hold the locked check here for extra safety.
#[tauri::command]
pub fn get_all_password_entries(
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<Vec<db::PasswordEntry>, String> {
    {
        let guard = vault_state
            .lock()
            .map_err(|_| "VaultState mutex poisoned.".to_string())?;
        if !guard.is_unlocked {
            return Err("Vault is locked – no encryption key available.".into());
        }
    }
    db::get_all_entries()
}

/// Delete a password entry by ID.
#[tauri::command]
pub fn delete_password_entry(
    id: String,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    {
        let guard = vault_state
            .lock()
            .map_err(|_| "VaultState mutex poisoned.".to_string())?;
        if !guard.is_unlocked {
            return Err("Vault is locked – no encryption key available.".into());
        }
    }
    db::delete_entry(&id)
}

/// Decrypt a single entry's password and return the plaintext.
#[tauri::command]
pub fn decrypt_entry_password(
    id: String,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<String, String> {
    let key = get_key(&vault_state)?;

    let entries = db::get_all_entries()?;
    let entry = entries
        .iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("Entry '{id}' not found."))?;

    let raw = db::base64_decode(&entry.encrypted_password)
        .map_err(|e| format!("Base64 decode error: {e}"))?;

    crypto::decrypt_password(key.as_bytes(), &raw)
}

// ── Password generator ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GeneratePasswordOptions {
    pub length: usize,
    pub include_uppercase: bool,
    pub include_lowercase: bool,
    pub include_numbers: bool,
    pub include_symbols: bool,
}

/// Generate a cryptographically random password according to the given options.
/// Does not require the vault to be unlocked.
#[tauri::command]
pub fn generate_password(options: GeneratePasswordOptions) -> Result<String, String> {
    const UPPER: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const LOWER: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
    const DIGITS: &[u8] = b"0123456789";
    const SYMBOLS: &[u8] = b"!@#$%^&*()-_=+[]{}|;:,.<>?";

    if options.length == 0 || options.length > 256 {
        return Err("Password length must be between 1 and 256.".into());
    }

    let mut charset: Vec<u8> = Vec::new();
    if options.include_uppercase {
        charset.extend_from_slice(UPPER);
    }
    if options.include_lowercase {
        charset.extend_from_slice(LOWER);
    }
    if options.include_numbers {
        charset.extend_from_slice(DIGITS);
    }
    if options.include_symbols {
        charset.extend_from_slice(SYMBOLS);
    }

    if charset.is_empty() {
        return Err("At least one character set must be selected.".into());
    }

    let mut rng = thread_rng();

    // Guarantee at least one character from every requested set
    let mut required: Vec<u8> = Vec::new();
    if options.include_uppercase {
        required.push(*UPPER.choose(&mut rng).unwrap());
    }
    if options.include_lowercase {
        required.push(*LOWER.choose(&mut rng).unwrap());
    }
    if options.include_numbers {
        required.push(*DIGITS.choose(&mut rng).unwrap());
    }
    if options.include_symbols {
        required.push(*SYMBOLS.choose(&mut rng).unwrap());
    }

    // Fill the rest randomly from the full charset
    let remaining = options.length.saturating_sub(required.len());
    let mut password: Vec<u8> = required;
    for _ in 0..remaining {
        password.push(*charset.choose(&mut rng).unwrap());
    }

    // Shuffle to distribute mandatory characters uniformly
    password.shuffle(&mut rng);

    String::from_utf8(password).map_err(|e| format!("UTF-8 error: {e}"))
}

// ── Search ─────────────────────────────────────────────────────────────────────

/// Return entries whose service name or username matches the query (case-insensitive).
#[tauri::command]
pub fn search_entries(
    query: String,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<Vec<db::PasswordEntry>, String> {
    {
        let guard = vault_state
            .lock()
            .map_err(|_| "VaultState mutex poisoned.".to_string())?;
        if !guard.is_unlocked {
            return Err("Vault is locked – no encryption key available.".into());
        }
    }

    let all = db::get_all_entries()?;
    let q = query.to_lowercase();
    Ok(all
        .into_iter()
        .filter(|e| {
            e.service_name.to_lowercase().contains(&q)
                || e.username.to_lowercase().contains(&q)
                || e.email.to_lowercase().contains(&q)
                || e.category.to_lowercase().contains(&q)
        })
        .collect())
}
