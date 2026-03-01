// src-tauri/src/multi_vault.rs
// ─────────────────────────────────────────────────────────────────────────────
// Multi-vault management: create, list, rename, delete, select vaults.
//
// Each vault is a fully isolated directory under:
//   AppData/com.hp.smart-vault/vaults/<uuid>/
//     vault_config.json   – Argon2id master hash
//     vault.salt           – 32-byte KDF salt
//     vault.db             – SQLite database (passwords + documents)
//     documents/           – encrypted document blobs
//
// The vault index lives at:
//   AppData/com.hp.smart-vault/vault_index.json
// ─────────────────────────────────────────────────────────────────────────────

use crate::{auth, crypto, db, state::VaultState};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::State;
use uuid::Uuid;
use zeroize::Zeroizing;

// ── Vault index types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMeta {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct VaultIndex {
    version: u32,
    vaults: Vec<VaultMeta>,
}

impl VaultIndex {
    fn new() -> Self {
        Self {
            version: 1,
            vaults: Vec::new(),
        }
    }
}

// ── Paths ──────────────────────────────────────────────────────────────────────

fn index_path() -> Result<PathBuf, String> {
    let app_dir = db::app_data_dir()?;
    Ok(app_dir.join("vault_index.json"))
}

fn vaults_dir() -> Result<PathBuf, String> {
    let dir = db::app_data_dir()?.join("vaults");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create vaults directory: {e}"))?;
    }
    Ok(dir)
}

fn vault_dir(vault_id: &str) -> Result<PathBuf, String> {
    let dir = vaults_dir()?.join(vault_id);
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create vault directory: {e}"))?;
    }
    Ok(dir)
}

// ── Index persistence ──────────────────────────────────────────────────────────

fn load_index() -> Result<VaultIndex, String> {
    let path = index_path()?;
    if !path.exists() {
        return Ok(VaultIndex::new());
    }
    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read vault index: {e}"))?;
    if data.trim().is_empty() {
        return Ok(VaultIndex::new());
    }
    serde_json::from_str(&data)
        .map_err(|e| format!("Corrupted vault index: {e}"))
}

fn save_index(index: &VaultIndex) -> Result<(), String> {
    let path = index_path()?;
    let json = serde_json::to_string_pretty(index)
        .map_err(|e| format!("Serialisation error: {e}"))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write vault index: {e}"))?;
    Ok(())
}

// ── Commands ───────────────────────────────────────────────────────────────────

/// List all vaults in the index.
#[tauri::command]
pub fn list_vaults() -> Result<Vec<VaultMeta>, String> {
    let index = load_index()?;
    Ok(index.vaults)
}

/// Create a new vault with the given name and master password.
/// Returns the new vault's metadata.
#[tauri::command]
pub fn create_vault(name: String, master_password: String) -> Result<VaultMeta, String> {
    let master_password = Zeroizing::new(master_password);
    if name.trim().is_empty() {
        return Err("Vault name must not be empty.".into());
    }
    if master_password.trim().is_empty() {
        return Err("Master password must not be empty.".into());
    }

    let mut index = load_index()?;

    // Check for duplicate names
    if index.vaults.iter().any(|v| v.name.eq_ignore_ascii_case(name.trim())) {
        return Err("A vault with this name already exists.".into());
    }

    let vault_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    // Create vault directory
    let _dir = vault_dir(&vault_id)?;

    // Hash and persist the master password for this vault
    let salt_str = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(master_password.as_bytes(), &salt_str)
        .map_err(|e| format!("Hashing failed: {e}"))?
        .to_string();

    // Write vault_config.json
    auth::write_config_for_vault(
        &vault_id,
        &auth::VaultConfig { master_hash: hash },
    )?;

    // Create the KDF salt for this vault
    let _salt = crypto::load_or_create_salt_for_vault(&vault_id)?;

    // Initialize the DB so tables are created
    db::close_db().ok(); // ignore if nothing was open
    db::init_db_for_vault(&vault_id)?;
    db::close_db().ok(); // close again — vault isn't selected yet

    // Add to index
    let meta = VaultMeta {
        id: vault_id,
        name: name.trim().to_string(),
        created_at: now,
    };
    index.vaults.push(meta.clone());
    save_index(&index)?;

    Ok(meta)
}

/// Delete a vault by ID.
/// Cannot delete the last vault if `allow_delete_last` is false.
#[tauri::command]
pub fn delete_vault(
    vault_id: String,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<bool, String> {
    let mut index = load_index()?;

    // Find the vault
    let pos = index
        .vaults
        .iter()
        .position(|v| v.id == vault_id)
        .ok_or_else(|| "Vault not found.".to_string())?;

    if index.vaults.len() <= 1 {
        return Err("Cannot delete the last vault.".into());
    }

    // If this is the active vault, lock it first
    {
        let mut state = vault_state
            .lock()
            .map_err(|_| "State lock poisoned.".to_string())?;
        if state.active_vault_id.as_deref() == Some(&vault_id) {
            state.lock();
            state.active_vault_id = None;
            drop(state);
            db::close_db()?;
        }
    }

    // Remove vault directory
    let dir = vaults_dir()?.join(&vault_id);
    if dir.exists() {
        fs::remove_dir_all(&dir)
            .map_err(|e| format!("Failed to remove vault directory: {e}"))?;
    }

    // Remove from index
    index.vaults.remove(pos);
    save_index(&index)?;

    Ok(true)
}

/// Rename a vault.
#[tauri::command]
pub fn rename_vault(vault_id: String, new_name: String) -> Result<bool, String> {
    if new_name.trim().is_empty() {
        return Err("Vault name must not be empty.".into());
    }

    let mut index = load_index()?;

    // Check for duplicate names (excluding the vault being renamed)
    if index
        .vaults
        .iter()
        .any(|v| v.id != vault_id && v.name.eq_ignore_ascii_case(new_name.trim()))
    {
        return Err("A vault with this name already exists.".into());
    }

    let vault = index
        .vaults
        .iter_mut()
        .find(|v| v.id == vault_id)
        .ok_or_else(|| "Vault not found.".to_string())?;

    vault.name = new_name.trim().to_string();
    save_index(&index)?;

    Ok(true)
}

/// Select a vault as the active vault (does NOT unlock it — frontend calls
/// `unlock_vault` afterwards with the vault_id).
/// Closes the current DB and resets state.
#[tauri::command]
pub fn select_vault(
    vault_id: String,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<bool, String> {
    let index = load_index()?;

    // Validate vault exists
    if !index.vaults.iter().any(|v| v.id == vault_id) {
        return Err("Vault not found.".to_string());
    }

    // Lock current vault, close DB
    {
        let mut state = vault_state
            .lock()
            .map_err(|_| "State lock poisoned.".to_string())?;
        state.lock();
        state.active_vault_id = Some(vault_id);
    }
    db::close_db()?;

    Ok(true)
}

/// Get the currently active vault ID.
#[tauri::command]
pub fn get_active_vault_id(
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<Option<String>, String> {
    let state = vault_state
        .lock()
        .map_err(|_| "State lock poisoned.".to_string())?;
    Ok(state.active_vault_id.clone())
}
