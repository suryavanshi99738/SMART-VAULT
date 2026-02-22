// src-tauri/src/crypto.rs
// ─────────────────────────────────────────────────────────────────────────────
// AES-256-GCM encryption / decryption for vault passwords.
//
// Security design:
// • No global mutable state — encryption key is passed explicitly to every
//   operation, sourced from the Tauri-managed VaultState.
// • Key derived via Argon2id with strong params (64 MiB / 3 iter / 4 lanes)
// • 32-byte cryptographically random salt persisted once to disk
//   (salt is NOT secret; it only prevents pre-computation attacks)
// • 12-byte random nonce per encryption call, prepended to ciphertext
// • All in-memory key copies are zeroized immediately after use
// ─────────────────────────────────────────────────────────────────────────────

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::RngCore;
use std::{fs, path::PathBuf};
use zeroize::Zeroize;

/// AES-256-GCM nonce length (96 bits per NIST SP 800-38D).
const NONCE_LEN: usize = 12;

/// Salt length — 32 bytes = 256 bits of entropy.
const SALT_LEN: usize = 32;

/// Argon2id parameters tuned for desktop (~0.5–1 s on modern hardware):
/// 64 MiB memory, 3 iterations, 4 parallel lanes → 256-bit output tag.
const ARGON2_M_COST: u32 = 65536; // KiB
const ARGON2_T_COST: u32 = 3;
const ARGON2_P_COST: u32 = 4;

// ── Salt persistence ───────────────────────────────────────────────────────────

/// Path to the per-installation random salt file.
/// The salt is public (not secret) — it only ensures uniqueness of the KDF.
fn salt_path() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "Cannot resolve app-data directory.".to_string())?
        .join("com.hp.smart-vault");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create app directory: {e}"))?;
    }
    Ok(dir.join("vault.salt"))
}

/// Load the existing salt or generate and persist a fresh random one.
pub fn load_or_create_salt() -> Result<Vec<u8>, String> {
    let path = salt_path()?;
    if path.exists() {
        let salt = fs::read(&path)
            .map_err(|e| format!("Failed to read salt: {e}"))?;
        if salt.len() == SALT_LEN {
            return Ok(salt);
        }
        // Corrupt / truncated — regenerate
    }
    let mut salt = vec![0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    fs::write(&path, &salt)
        .map_err(|e| format!("Failed to write salt: {e}"))?;
    Ok(salt)
}

// ── Key derivation ─────────────────────────────────────────────────────────────

/// Derive a 256-bit AES key from `master_password` using Argon2id.
/// Returns the raw key bytes — the caller MUST zeroize them after use.
pub fn derive_key(master_password: &str, salt: &[u8]) -> Result<Vec<u8>, String> {
    let params = Params::new(ARGON2_M_COST, ARGON2_T_COST, ARGON2_P_COST, Some(32))
        .map_err(|e| format!("Argon2 parameter error: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = vec![0u8; 32];
    argon2
        .hash_password_into(master_password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Key derivation failed: {e}"))?;

    Ok(key)
}

// ── Encrypt / Decrypt ──────────────────────────────────────────────────────────

/// Encrypt `plaintext` with `key`.
/// Returns `nonce (12 B) || ciphertext+tag`.
/// `key` is NOT modified; caller is responsible for its lifetime.
pub fn encrypt_password(key: &[u8], plaintext: &str) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Cipher init failed: {e}"))?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {e}"))?;

    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Decrypt a `nonce || ciphertext+tag` blob back to a UTF-8 string.
/// `key` is NOT modified; caller is responsible for its lifetime.
pub fn decrypt_password(key: &[u8], data: &[u8]) -> Result<String, String> {
    if data.len() < NONCE_LEN + 1 {
        return Err("Encrypted data is too short.".into());
    }
    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Cipher init failed: {e}"))?;

    let mut plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed – wrong key or corrupted data.".to_string())?;

    let result = String::from_utf8(plaintext.clone())
        .map_err(|e| format!("UTF-8 decode failed: {e}"))?;

    plaintext.zeroize();
    Ok(result)
}

