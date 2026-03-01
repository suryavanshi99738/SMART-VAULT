// src-tauri/src/auth.rs
// ─────────────────────────────────────────────────────────────────────────────
// Master password management and vault unlock/lock commands.
//
// Security design:
// • Argon2id PHC hashes stored on disk (hash only, never the password)
// • unlock_vault: verifies hash + derives AES-256 key + stores in VaultState
// • lock_vault: zeroizes key in VaultState
// • Brute-force: max 5 attempts, 30 s cooldown — tracked in VaultState
// • All operations are constant-time where the argon2 crate guarantees it
// ─────────────────────────────────────────────────────────────────────────────

use crate::{crypto, db, state::VaultState};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex, time::Instant};
use tauri::State;
use zeroize::Zeroizing;

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS: u32 = 5;
const LOCKOUT_SECS: u64 = 30;

// ── Persisted config ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultConfig {
    /// Argon2id PHC string (algorithm + params + salt + hash in one string)
    pub master_hash: String,
}

fn config_path() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "Cannot resolve app-data directory.".to_string())?
        .join("com.hp.smart-vault");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create app directory: {e}"))?;
    }
    Ok(dir.join("vault_config.json"))
}

/// Config path for a specific vault.
pub fn config_path_for_vault(vault_id: &str) -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "Cannot resolve app-data directory.".to_string())?
        .join("com.hp.smart-vault")
        .join("vaults")
        .join(vault_id);
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create vault directory: {e}"))?;
    }
    Ok(dir.join("vault_config.json"))
}

fn read_config() -> Result<Option<VaultConfig>, String> {
    let path = config_path()?;
    read_config_at(&path)
}

pub fn read_config_for_vault(vault_id: &str) -> Result<Option<VaultConfig>, String> {
    let path = config_path_for_vault(vault_id)?;
    read_config_at(&path)
}

fn read_config_at(path: &PathBuf) -> Result<Option<VaultConfig>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config: {e}"))?;
    if data.trim().is_empty() {
        return Ok(None);
    }
    let cfg: VaultConfig = serde_json::from_str(&data)
        .map_err(|e| format!("Corrupted config — please reset: {e}"))?;
    Ok(Some(cfg))
}

fn write_config(cfg: &VaultConfig) -> Result<(), String> {
    let path = config_path()?;
    write_config_at(&path, cfg)
}

pub fn write_config_for_vault(vault_id: &str, cfg: &VaultConfig) -> Result<(), String> {
    let path = config_path_for_vault(vault_id)?;
    write_config_at(&path, cfg)
}

fn write_config_at(path: &PathBuf, cfg: &VaultConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| format!("Serialisation error: {e}"))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write config: {e}"))?;
    Ok(())
}

// ── Response type ──────────────────────────────────────────────────────────────

/// Returned from `unlock_vault` so the frontend can show precise feedback.
#[derive(Debug, Serialize)]
pub struct UnlockResult {
    pub success: bool,
    /// Attempts remaining before lockout (0 when locked out).
    pub remaining_attempts: u32,
    /// Seconds until lockout expires (0 when not locked out).
    pub lockout_seconds: u64,
}

// ── Commands ───────────────────────────────────────────────────────────────────

/// Check whether a master password has been configured.
/// If `vault_id` is provided, checks for that vault; otherwise uses the legacy
/// single-vault config.
#[tauri::command]
pub fn check_if_master_exists(vault_id: Option<String>) -> Result<bool, String> {
    let cfg = match vault_id {
        Some(ref id) => read_config_for_vault(id)?,
        None => read_config()?,
    };
    Ok(cfg.is_some())
}

/// First-run setup: hash and persist the master password.
/// If `vault_id` is provided, writes to that vault's config directory.
#[tauri::command]
pub fn set_master_password(password: String, vault_id: Option<String>) -> Result<bool, String> {
    let password = Zeroizing::new(password);
    if password.trim().is_empty() {
        return Err("Password must not be empty.".into());
    }

    let existing = match vault_id {
        Some(ref id) => read_config_for_vault(id)?,
        None => read_config()?,
    };
    if existing.is_some() {
        return Err("Master password already set.".into());
    }

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Hashing failed: {e}"))?
        .to_string();

    let cfg = VaultConfig { master_hash: hash };
    match vault_id {
        Some(ref id) => write_config_for_vault(id, &cfg)?,
        None => write_config(&cfg)?,
    };
    Ok(true)
}

/// Verify the supplied password, derive the AES-256 encryption key, and store
/// it in the Tauri-managed `VaultState`. Enforces brute-force protection.
///
/// If `vault_id` is provided, uses per-vault config/salt/db paths.
/// Otherwise falls back to legacy single-vault paths.
///
/// On success: key is stored in state, vault is marked unlocked, DB is opened.
/// On failure: increments attempt counter, enforces lockout when limit reached.
#[tauri::command]
pub fn unlock_vault(
    password: String,
    vault_id: Option<String>,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<UnlockResult, String> {
    let password = Zeroizing::new(password);
    if password.trim().is_empty() {
        return Err("Password must not be empty.".into());
    }

    // ── Brute-force check ─────────────────────────────────────────────────────
    {
        let state = vault_state
            .lock()
            .map_err(|_| "State lock poisoned.".to_string())?;

        if let Some(until) = state.lockout_until {
            let now = Instant::now();
            if now < until {
                let remaining = (until - now).as_secs().max(1);
                return Ok(UnlockResult {
                    success: false,
                    remaining_attempts: 0,
                    lockout_seconds: remaining,
                });
            }
        }
    }

    // ── Verify hash ───────────────────────────────────────────────────────────
    let cfg = match vault_id {
        Some(ref id) => read_config_for_vault(id)?
            .ok_or_else(|| "No master password configured for this vault.".to_string())?,
        None => read_config()?
            .ok_or_else(|| "No master password configured.".to_string())?,
    };

    let parsed = PasswordHash::new(&cfg.master_hash)
        .map_err(|e| format!("Stored hash is invalid: {e}"))?;

    match Argon2::default().verify_password(password.as_bytes(), &parsed) {
        Ok(()) => {
            // ── Derive AES-256 key and store in VaultState ────────────────────
            let salt = match vault_id {
                Some(ref id) => crypto::load_or_create_salt_for_vault(id)?,
                None => crypto::load_or_create_salt()?,
            };
            let key = crypto::derive_key(&password, &salt)?;

            let mut state = vault_state
                .lock()
                .map_err(|_| "State lock poisoned.".to_string())?;

            state.set_key(key); // also resets failed_attempts + lockout_until
            state.active_vault_id = vault_id.clone();

            // Close any previously open DB, then open the correct one
            drop(state); // release lock before calling db (avoids potential deadlock)
            db::close_db()?;
            match vault_id {
                Some(ref id) => db::init_db_for_vault(id)?,
                None => db::init_db()?,
            };

            Ok(UnlockResult {
                success: true,
                remaining_attempts: MAX_FAILED_ATTEMPTS,
                lockout_seconds: 0,
            })
        }
        Err(argon2::password_hash::Error::Password) => {
            let mut state = vault_state
                .lock()
                .map_err(|_| "State lock poisoned.".to_string())?;

            state.failed_attempts += 1;

            if state.failed_attempts >= MAX_FAILED_ATTEMPTS {
                state.lockout_until =
                    Some(Instant::now() + std::time::Duration::from_secs(LOCKOUT_SECS));
                state.failed_attempts = 0;
                return Ok(UnlockResult {
                    success: false,
                    remaining_attempts: 0,
                    lockout_seconds: LOCKOUT_SECS,
                });
            }

            let remaining = MAX_FAILED_ATTEMPTS - state.failed_attempts;
            Ok(UnlockResult {
                success: false,
                remaining_attempts: remaining,
                lockout_seconds: 0,
            })
        }
        Err(e) => Err(format!("Verification error: {e}")),
    }
}

/// Lock the vault: zeroize the encryption key, clear runtime state.
#[tauri::command]
pub fn lock_vault(vault_state: State<'_, Mutex<VaultState>>) -> Result<bool, String> {
    let mut state = vault_state
        .lock()
        .map_err(|_| "State lock poisoned.".to_string())?;
    state.lock();
    Ok(true)
}
