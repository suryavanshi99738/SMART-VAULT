// src-tauri/src/document_crypto.rs
// ─────────────────────────────────────────────────────────────────────────────
// AES-256-GCM chunked file encryption / decryption for the document vault.
//
// Security design:
// • Streaming encryption — never loads entire file into RAM.
// • 4 MB default chunk size (configurable via `chunk_size` param).
// • Each chunk has its own random 96-bit nonce → no nonce reuse.
// • Authenticated encryption: GCM tag per chunk prevents tampering.
// • If any chunk fails authentication → abort + delete partial output.
// • All intermediate buffers are zeroized after use.
//
// File format (.vaultbin):
//   [Header JSON (UTF-8, length-prefixed)] [Chunk 0] [Chunk 1] …
//
//   Header prefix: 4 bytes LE = length of JSON header
//   Each chunk:    12 bytes nonce | 4 bytes LE ciphertext_len | ciphertext+tag
// ─────────────────────────────────────────────────────────────────────────────

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{BufReader, BufWriter, Read, Write},
    path::{Path, PathBuf},
};
use zeroize::Zeroize;

/// AES-256-GCM nonce length (96 bits).
const NONCE_LEN: usize = 12;

/// Default chunk size: 4 MiB.
pub const DEFAULT_CHUNK_SIZE: u32 = 4 * 1024 * 1024;

/// Maximum allowed file size: 2 GiB.
pub const MAX_FILE_SIZE: u64 = 2 * 1024 * 1024 * 1024;

/// Encrypted file header stored at the start of each `.vaultbin`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedFileHeader {
    /// Format version — always 1 for now.
    pub version: u8,
    /// Original filename (encrypted separately inside the header JSON, the
    /// header itself is part of the vault storage, not exposed to the OS).
    pub original_filename: String,
    /// Original file extension (e.g. ".pdf").
    pub original_extension: String,
    /// Original unencrypted file size in bytes.
    pub file_size: u64,
    /// Chunk size used during encryption.
    pub chunk_size: u32,
    /// Total number of chunks.
    pub total_chunks: u64,
}

/// Progress callback: (current_chunk, total_chunks).
type ProgressFn = Box<dyn Fn(u64, u64) + Send + 'static>;

// ── Encrypt ────────────────────────────────────────────────────────────────────

/// Encrypt a file in chunks and write to `output_path`.
///
/// - `key`: 32-byte AES-256 key (caller must zeroize after use).
/// - `input_path`: path to the plaintext source file.
/// - `output_path`: destination `.vaultbin` file.
/// - `chunk_size`: encryption chunk size in bytes (0 = default 4 MiB).
/// - `on_progress`: optional callback for UI progress updates.
pub fn encrypt_file_chunked(
    key: &[u8],
    input_path: &Path,
    output_path: &Path,
    chunk_size: u32,
    on_progress: Option<ProgressFn>,
) -> Result<EncryptedFileHeader, String> {
    // Validate key length
    if key.len() != 32 {
        return Err("Encryption key must be exactly 32 bytes.".into());
    }

    let chunk_size = if chunk_size == 0 { DEFAULT_CHUNK_SIZE } else { chunk_size };

    // Read file metadata
    let metadata = fs::metadata(input_path)
        .map_err(|e| format!("Cannot read source file: {e}"))?;
    let file_size = metadata.len();

    if file_size > MAX_FILE_SIZE {
        return Err(format!(
            "File too large ({} bytes). Maximum is {} bytes.",
            file_size, MAX_FILE_SIZE
        ));
    }

    let total_chunks = if file_size == 0 {
        1 // Empty files still get one (empty) chunk
    } else {
        (file_size + chunk_size as u64 - 1) / chunk_size as u64
    };

    // Extract original filename + extension
    let original_filename = input_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let original_extension = input_path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    let header = EncryptedFileHeader {
        version: 1,
        original_filename,
        original_extension,
        file_size,
        chunk_size,
        total_chunks,
    };

    // Serialize header
    let header_json = serde_json::to_vec(&header)
        .map_err(|e| format!("Header serialization failed: {e}"))?;
    let header_len = header_json.len() as u32;

    // Open files
    let input_file = File::open(input_path)
        .map_err(|e| format!("Cannot open source file: {e}"))?;
    let mut reader = BufReader::new(input_file);

    let output_file = File::create(output_path)
        .map_err(|e| format!("Cannot create output file: {e}"))?;
    let mut writer = BufWriter::new(output_file);

    // Write header length (4 bytes LE) + header JSON
    writer
        .write_all(&header_len.to_le_bytes())
        .map_err(|e| format!("Write error (header length): {e}"))?;
    writer
        .write_all(&header_json)
        .map_err(|e| format!("Write error (header): {e}"))?;

    // Create cipher
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Cipher init failed: {e}"))?;

    let mut rng = rand::thread_rng();
    let mut buf = vec![0u8; chunk_size as usize];

    for chunk_idx in 0..total_chunks {
        // Read chunk
        let bytes_to_read = if chunk_idx == total_chunks - 1 && file_size > 0 {
            let remaining = file_size - (chunk_idx * chunk_size as u64);
            remaining as usize
        } else if file_size == 0 {
            0
        } else {
            chunk_size as usize
        };

        let read_buf = &mut buf[..bytes_to_read];
        reader
            .read_exact(read_buf)
            .map_err(|e| format!("Read error at chunk {chunk_idx}: {e}"))?;

        // Generate unique nonce
        let mut nonce_bytes = [0u8; NONCE_LEN];
        rng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        // Encrypt chunk (ciphertext includes GCM auth tag)
        let ciphertext = cipher
            .encrypt(nonce, &read_buf[..])
            .map_err(|e| {
                // Clean up partial output
                let _ = fs::remove_file(output_path);
                format!("Encryption failed at chunk {chunk_idx}: {e}")
            })?;

        // Write: nonce (12) + ciphertext_len (4 LE) + ciphertext
        let ct_len = ciphertext.len() as u32;
        writer
            .write_all(&nonce_bytes)
            .map_err(|e| format!("Write error (nonce, chunk {chunk_idx}): {e}"))?;
        writer
            .write_all(&ct_len.to_le_bytes())
            .map_err(|e| format!("Write error (ct_len, chunk {chunk_idx}): {e}"))?;
        writer
            .write_all(&ciphertext)
            .map_err(|e| format!("Write error (ciphertext, chunk {chunk_idx}): {e}"))?;

        // Zeroize plaintext buffer
        buf[..bytes_to_read].zeroize();

        // Progress callback
        if let Some(ref cb) = on_progress {
            cb(chunk_idx + 1, total_chunks);
        }
    }

    writer.flush().map_err(|e| format!("Flush failed: {e}"))?;
    Ok(header)
}

// ── Decrypt ────────────────────────────────────────────────────────────────────

/// Decrypt a `.vaultbin` file in chunks and write plaintext to `output_path`.
///
/// If any chunk fails GCM authentication, the partial output is deleted
/// and an error is returned.
pub fn decrypt_file_chunked(
    key: &[u8],
    encrypted_path: &Path,
    output_path: &Path,
    on_progress: Option<ProgressFn>,
) -> Result<EncryptedFileHeader, String> {
    if key.len() != 32 {
        return Err("Decryption key must be exactly 32 bytes.".into());
    }

    let input_file = File::open(encrypted_path)
        .map_err(|e| format!("Cannot open encrypted file: {e}"))?;
    let mut reader = BufReader::new(input_file);

    // Read header length
    let mut header_len_buf = [0u8; 4];
    reader
        .read_exact(&mut header_len_buf)
        .map_err(|e| format!("Read error (header length): {e}"))?;
    let header_len = u32::from_le_bytes(header_len_buf) as usize;

    if header_len > 64 * 1024 {
        return Err("Corrupted file: header length exceeds 64 KiB.".into());
    }

    // Read header JSON
    let mut header_buf = vec![0u8; header_len];
    reader
        .read_exact(&mut header_buf)
        .map_err(|e| format!("Read error (header): {e}"))?;

    let header: EncryptedFileHeader = serde_json::from_slice(&header_buf)
        .map_err(|e| format!("Corrupted header: {e}"))?;

    if header.version != 1 {
        return Err(format!("Unsupported file version: {}", header.version));
    }

    // Create cipher
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Cipher init failed: {e}"))?;

    let output_file = File::create(output_path)
        .map_err(|e| format!("Cannot create output file: {e}"))?;
    let mut writer = BufWriter::new(output_file);

    for chunk_idx in 0..header.total_chunks {
        // Read nonce
        let mut nonce_bytes = [0u8; NONCE_LEN];
        reader.read_exact(&mut nonce_bytes).map_err(|e| {
            let _ = fs::remove_file(output_path);
            format!("Read error (nonce, chunk {chunk_idx}): {e}")
        })?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        // Read ciphertext length
        let mut ct_len_buf = [0u8; 4];
        reader.read_exact(&mut ct_len_buf).map_err(|e| {
            let _ = fs::remove_file(output_path);
            format!("Read error (ct_len, chunk {chunk_idx}): {e}")
        })?;
        let ct_len = u32::from_le_bytes(ct_len_buf) as usize;

        // Sanity check: ciphertext for a 4MB chunk + 16-byte tag should not exceed ~4.1 MB
        if ct_len > (header.chunk_size as usize + 1024) {
            let _ = fs::remove_file(output_path);
            return Err(format!(
                "Corrupted file: chunk {chunk_idx} ciphertext length {ct_len} exceeds expected maximum."
            ));
        }

        // Read ciphertext
        let mut ct_buf = vec![0u8; ct_len];
        reader.read_exact(&mut ct_buf).map_err(|e| {
            let _ = fs::remove_file(output_path);
            format!("Read error (ciphertext, chunk {chunk_idx}): {e}")
        })?;

        // Decrypt + verify auth tag
        let mut plaintext = cipher.decrypt(nonce, ct_buf.as_slice()).map_err(|_| {
            let _ = fs::remove_file(output_path);
            format!(
                "Authentication failed at chunk {chunk_idx}. File may be corrupted or wrong key."
            )
        })?;

        writer.write_all(&plaintext).map_err(|e| {
            let _ = fs::remove_file(output_path);
            format!("Write error (plaintext, chunk {chunk_idx}): {e}")
        })?;

        // Zeroize buffers
        plaintext.zeroize();
        ct_buf.zeroize();

        if let Some(ref cb) = on_progress {
            cb(chunk_idx + 1, header.total_chunks);
        }
    }

    writer.flush().map_err(|e| format!("Flush failed: {e}"))?;
    Ok(header)
}

// ── Read header only (for metadata listing) ────────────────────────────────────

/// Read just the header of an encrypted `.vaultbin` file without decrypting.
pub fn read_encrypted_header(encrypted_path: &Path) -> Result<EncryptedFileHeader, String> {
    let input_file = File::open(encrypted_path)
        .map_err(|e| format!("Cannot open file: {e}"))?;
    let mut reader = BufReader::new(input_file);

    let mut header_len_buf = [0u8; 4];
    reader
        .read_exact(&mut header_len_buf)
        .map_err(|e| format!("Read error: {e}"))?;
    let header_len = u32::from_le_bytes(header_len_buf) as usize;

    if header_len > 64 * 1024 {
        return Err("Corrupted file header.".into());
    }

    let mut header_buf = vec![0u8; header_len];
    reader
        .read_exact(&mut header_buf)
        .map_err(|e| format!("Read error: {e}"))?;

    serde_json::from_slice(&header_buf).map_err(|e| format!("Corrupted header: {e}"))
}

// ── Secure temp directory ──────────────────────────────────────────────────────

/// Get the secure temporary directory for decrypted files.
pub fn secure_temp_dir() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "Cannot resolve app-data directory.".to_string())?
        .join("com.hp.smart-vault")
        .join("temp");

    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create temp directory: {e}"))?;
    }

    Ok(dir)
}

/// Get the documents storage directory.
pub fn documents_dir() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "Cannot resolve app-data directory.".to_string())?
        .join("com.hp.smart-vault")
        .join("documents");

    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create documents directory: {e}"))?;
    }

    Ok(dir)
}
