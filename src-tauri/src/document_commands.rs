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
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::State;
use uuid::Uuid;

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
    chunk_size: u32,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<SecureDocument, String> {
    validate_filename(&document_name)?;
    let key = get_key(&vault_state)?;

    let src = PathBuf::from(&source_path);
    if !src.exists() {
        return Err("Source file does not exist.".into());
    }

    let id = Uuid::new_v4().to_string();
    let encrypted_file_name = format!("{id}.vaultbin");

    let docs_dir = document_crypto::documents_dir()?;
    let output_path = docs_dir.join(&encrypted_file_name);

    // Encrypt the file
    let header = document_crypto::encrypt_file_chunked(
        &key,
        &src,
        &output_path,
        chunk_size,
        None, // Progress via events would require AppHandle — keeping simple for commands
    )?;

    let now = now_ts()?;

    // Store metadata in DB
    db::insert_document(
        &id,
        &document_name,
        &encrypted_file_name,
        &header.original_extension,
        header.file_size,
        has_password,
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
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<String, String> {
    let key = get_key(&vault_state)?;

    let doc = db::get_document(&document_id)?
        .ok_or_else(|| format!("Document '{document_id}' not found."))?;

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
    document_crypto::decrypt_file_chunked(&key, &encrypted_path, &temp_path, None)?;

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
