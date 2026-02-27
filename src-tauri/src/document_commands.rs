// src-tauri/src/document_commands.rs
// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands for the encrypted document vault.
//
// Security model:
// • All commands require the vault to be unlocked (AES key in VaultState).
// • Documents are encrypted with AES-256-GCM using chunked streaming.
// • Metadata is stored in SQLite alongside password entries.
// • Temp decrypted files are cleaned up by secure wipe.
// • Path traversal is explicitly prevented.
// ─────────────────────────────────────────────────────────────────────────────

use crate::{db, document_crypto, secure_wipe, state::VaultState};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::State;
use uuid::Uuid;
use zeroize::Zeroize;

// ── DTOs ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureDocument {
    pub id: String,
    pub name: String,
    pub encrypted_file_name: String,
    pub original_extension: String,
    pub size: u64,
    pub has_password: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Progress info emitted during encrypt/decrypt operations.
#[derive(Debug, Clone, Serialize)]
#[allow(dead_code)]
pub struct DocumentProgress {
    pub current_chunk: u64,
    pub total_chunks: u64,
    pub percent: f64,
}

// ── Document-level password key derivation ─────────────────────────────────────

/// Argon2id params for document passwords (lighter than vault-level for UX):
/// 32 MiB memory, 2 iterations, 2 parallel lanes → 256-bit output.
const DOC_ARGON2_M_COST: u32 = 32768; // KiB
const DOC_ARGON2_T_COST: u32 = 2;
const DOC_ARGON2_P_COST: u32 = 2;

/// Generate a random 32-byte salt for a document password.
fn generate_doc_salt() -> Vec<u8> {
    let mut salt = vec![0u8; 32];
    rand::thread_rng().fill_bytes(&mut salt);
    salt
}

/// Derive a 256-bit key from a document password + salt using Argon2id.
fn derive_doc_key(password: &str, salt: &[u8]) -> Result<Vec<u8>, String> {
    let params = Params::new(DOC_ARGON2_M_COST, DOC_ARGON2_T_COST, DOC_ARGON2_P_COST, Some(32))
        .map_err(|e| format!("Argon2 param error: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = vec![0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Document key derivation failed: {e}"))?;
    Ok(key)
}

/// Combine vault key with document-password-derived key via XOR.
/// Result: both the vault master key AND the document password are required.
fn combine_keys(vault_key: &[u8], doc_key: &[u8]) -> Vec<u8> {
    vault_key
        .iter()
        .zip(doc_key.iter())
        .map(|(a, b)| a ^ b)
        .collect()
}

/// Encode bytes as hex string for DB storage.
fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Decode hex string back to bytes.
fn hex_decode(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err("Invalid hex string length.".into());
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).map_err(|e| format!("Hex decode error: {e}")))
        .collect()
}

// ── Path safety ────────────────────────────────────────────────────────────────

/// Reject any filename containing path traversal characters.
fn validate_filename(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Document name cannot be empty.".into());
    }
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("Invalid characters in document name.".into());
    }
    Ok(())
}

/// Acquire the encryption key from VaultState or fail.
fn get_key(vault_state: &State<'_, Mutex<VaultState>>) -> Result<Vec<u8>, String> {
    let guard = vault_state
        .lock()
        .map_err(|_| "VaultState mutex poisoned.".to_string())?;
    guard.key().map(|k| k.to_vec())
}

fn now_ts() -> Result<i64, String> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())
        .map(|d| d.as_secs() as i64)
}

// ── Commands ───────────────────────────────────────────────────────────────────

/// Import and encrypt a document into the vault.
///
/// 1. Read source file from `source_path`.
/// 2. Encrypt using chunked AES-256-GCM.
/// 3. Save to `AppData/SmartVault/documents/<id>.vaultbin`.
/// 4. Store metadata in the database.
#[tauri::command]
pub fn import_document(
    source_path: String,
    document_name: String,
    has_password: bool,
    document_password: Option<String>,
    chunk_size: u32,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<SecureDocument, String> {
    validate_filename(&document_name)?;
    let mut vault_key = get_key(&vault_state)?;

    let src = PathBuf::from(&source_path);
    if !src.exists() {
        return Err("Source file does not exist.".into());
    }

    // If document password is provided, derive a combined key
    let mut password_salt_hex: Option<String> = None;
    let encryption_key = if has_password {
        let doc_pw = document_password
            .as_deref()
            .filter(|p| !p.is_empty())
            .ok_or_else(|| "Password is required when password protection is enabled.".to_string())?;

        let salt = generate_doc_salt();
        let mut doc_key = derive_doc_key(doc_pw, &salt)?;
        let combined = combine_keys(&vault_key, &doc_key);
        password_salt_hex = Some(hex_encode(&salt));

        // Zeroize intermediate keys
        doc_key.zeroize();
        combined
    } else {
        vault_key.clone()
    };

    // Zeroize vault key since we have the encryption key now
    vault_key.zeroize();

    let id = Uuid::new_v4().to_string();
    let encrypted_file_name = format!("{id}.vaultbin");

    let docs_dir = document_crypto::documents_dir()?;
    let output_path = docs_dir.join(&encrypted_file_name);

    // Encrypt the file
    let header = document_crypto::encrypt_file_chunked(
        &encryption_key,
        &src,
        &output_path,
        chunk_size,
        None,
    )?;

    let now = now_ts()?;

    // Store metadata in DB (including password salt if present)
    db::insert_document(
        &id,
        &document_name,
        &encrypted_file_name,
        &header.original_extension,
        header.file_size,
        has_password,
        password_salt_hex.as_deref(),
        now,
    )?;

    Ok(SecureDocument {
        id,
        name: document_name,
        encrypted_file_name,
        original_extension: header.original_extension,
        size: header.file_size,
        has_password,
        created_at: now,
        updated_at: now,
    })
}

/// Decrypt a document to a temporary file and return the temp path.
/// The frontend should call `cleanup_temp_document` after the user is done.
#[tauri::command]
pub fn open_document(
    document_id: String,
    document_password: Option<String>,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<String, String> {
    let mut vault_key = get_key(&vault_state)?;

    let (doc, password_salt) = db::get_document_with_salt(&document_id)?
        .ok_or_else(|| format!("Document '{document_id}' not found."))?;

    // Build the decryption key: vault key (XOR) doc-password-derived key
    let decryption_key = if doc.has_password {
        let doc_pw = document_password
            .as_deref()
            .filter(|p| !p.is_empty())
            .ok_or_else(|| "This document requires a password to open.".to_string())?;

        let salt_hex = password_salt
            .ok_or_else(|| "Document is corrupted: missing password salt.".to_string())?;
        let salt = hex_decode(&salt_hex)?;

        let mut doc_key = derive_doc_key(doc_pw, &salt)?;
        let combined = combine_keys(&vault_key, &doc_key);
        doc_key.zeroize();
        combined
    } else {
        vault_key.clone()
    };

    vault_key.zeroize();

    let docs_dir = document_crypto::documents_dir()?;
    let encrypted_path = docs_dir.join(&doc.encrypted_file_name);

    if !encrypted_path.exists() {
        return Err("Encrypted document file not found on disk.".into());
    }

    let temp_dir = document_crypto::secure_temp_dir()?;

    // Read header to get original extension
    let header = document_crypto::read_encrypted_header(&encrypted_path)?;

    // Generate a temp filename that retains the original extension
    // so the OS opens it with the correct application.
    let temp_name = format!("sv-tmp-{}{}", Uuid::new_v4(), header.original_extension);
    let temp_path = temp_dir.join(&temp_name);

    // Decrypt
    document_crypto::decrypt_file_chunked(&decryption_key, &encrypted_path, &temp_path, None)?;

    // Security: validate the temp path is strictly inside our allowed directory.
    if !temp_path.starts_with(&temp_dir) {
        let _ = std::fs::remove_file(&temp_path);
        return Err("Path traversal detected in temp output.".into());
    }

    // Open the decrypted file with the OS default handler.
    // We use the `open` crate (ShellExecuteW on Windows, xdg-open on Linux,
    // `open` on macOS) to bypass Tauri's opener-plugin scope restrictions
    // entirely. This eliminates all scope-pattern / path-prefix / backslash
    // mismatch issues that plague the frontend openPath() approach.
    open::that(&temp_path)
        .map_err(|e| format!("Failed to open document with default application: {e}"))?;

    Ok(temp_path.to_string_lossy().to_string())
}

/// Clean up a temporary decrypted file using secure wipe.
#[tauri::command]
pub fn cleanup_temp_document(temp_path: String) -> Result<(), String> {
    let path = PathBuf::from(&temp_path);

    // Security: ensure the path is inside our temp directory
    let allowed_dir = document_crypto::secure_temp_dir()?;
    if !path.starts_with(&allowed_dir) {
        return Err("Path traversal detected — refusing to delete.".into());
    }

    secure_wipe::secure_delete(&path)
}

/// Clean up ALL temporary decrypted files.
#[tauri::command]
pub fn cleanup_all_temp_documents() -> Result<u64, String> {
    let temp_dir = document_crypto::secure_temp_dir()?;
    secure_wipe::secure_wipe_directory(&temp_dir)
}

/// Delete an encrypted document permanently.
///
/// 1. Secure-wipe the `.vaultbin` file from disk.
/// 2. Remove the metadata row from the database.
#[tauri::command]
pub fn delete_document(
    document_id: String,
    secure_delete_enabled: bool,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    // Require vault unlocked
    {
        let guard = vault_state
            .lock()
            .map_err(|_| "VaultState mutex poisoned.".to_string())?;
        if !guard.is_unlocked {
            return Err("Vault is locked.".into());
        }
    }

    let doc = db::get_document(&document_id)?
        .ok_or_else(|| format!("Document '{document_id}' not found."))?;

    let docs_dir = document_crypto::documents_dir()?;
    let file_path = docs_dir.join(&doc.encrypted_file_name);

    // Delete the encrypted file
    if file_path.exists() {
        if secure_delete_enabled {
            secure_wipe::secure_delete(&file_path)?;
        } else {
            std::fs::remove_file(&file_path)
                .map_err(|e| format!("Failed to delete file: {e}"))?;
        }
    }

    // Remove metadata from DB
    db::delete_document(&document_id)
}

/// List all stored documents.
#[tauri::command]
pub fn get_all_documents(
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<Vec<SecureDocument>, String> {
    {
        let guard = vault_state
            .lock()
            .map_err(|_| "VaultState mutex poisoned.".to_string())?;
        if !guard.is_unlocked {
            return Err("Vault is locked.".into());
        }
    }

    db::get_all_documents()
}

/// Get a single document's metadata.
#[tauri::command]
pub fn get_document_info(
    document_id: String,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<SecureDocument, String> {
    {
        let guard = vault_state
            .lock()
            .map_err(|_| "VaultState mutex poisoned.".to_string())?;
        if !guard.is_unlocked {
            return Err("Vault is locked.".into());
        }
    }

    db::get_document(&document_id)?
        .ok_or_else(|| format!("Document '{document_id}' not found."))
}

/// Secure-wipe a document from disk (standalone command for settings use).
#[tauri::command]
pub fn secure_delete_document(
    document_id: String,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    delete_document(document_id, true, vault_state)
}
