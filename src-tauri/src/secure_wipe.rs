// src-tauri/src/secure_wipe.rs
// ─────────────────────────────────────────────────────────────────────────────
// Secure file deletion — overwrite file contents with random + zero bytes
// before unlinking, so forensic recovery is infeasible.
//
// Workflow:
//   1. Open file in write mode.
//   2. Overwrite entire file with cryptographically secure random bytes.
//   3. Flush to disk (fsync).
//   4. Overwrite again with zero bytes (second pass).
//   5. Flush again.
//   6. Delete the file.
//
// Note: on SSDs with wear-leveling, multi-pass isn't guaranteed to overwrite
// the same physical sectors. But combined with encrypted-at-rest storage,
// this provides defence-in-depth beyond what the OS `remove_file` offers.
// ─────────────────────────────────────────────────────────────────────────────

use rand::RngCore;
use std::{
    fs::{self, File, OpenOptions},
    io::{Seek, SeekFrom, Write},
    path::Path,
};

/// Wipe buffer size: 64 KiB — balances speed and memory usage.
const WIPE_BUF_SIZE: usize = 64 * 1024;

/// Securely delete a file by overwriting its contents before removal.
///
/// - Pass 1: overwrite with cryptographically secure random bytes.
/// - Pass 2: overwrite with zero bytes.
/// - Then: flush, close, and delete.
///
/// If the file doesn't exist, returns `Ok(())` silently.
/// If any I/O step fails, attempts to delete the file anyway.
pub fn secure_delete(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    // Get file size before opening in write mode
    let file_size = fs::metadata(path)
        .map_err(|e| format!("Cannot read file metadata: {e}"))?
        .len();

    if file_size == 0 {
        // Nothing to overwrite — just delete
        fs::remove_file(path).map_err(|e| format!("Delete failed: {e}"))?;
        return Ok(());
    }

    // Open for writing without truncating
    let mut file = OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|e| format!("Cannot open file for wipe: {e}"))?;

    // Pass 1: random bytes
    if let Err(e) = overwrite_pass(&mut file, file_size, false) {
        // Best-effort: try to delete even if wipe fails
        let _ = fs::remove_file(path);
        return Err(format!("Wipe pass 1 (random) failed: {e}"));
    }

    // Pass 2: zero bytes
    if let Err(e) = overwrite_pass(&mut file, file_size, true) {
        let _ = fs::remove_file(path);
        return Err(format!("Wipe pass 2 (zero) failed: {e}"));
    }

    // Ensure data is flushed to disk
    file.sync_all()
        .map_err(|e| format!("Sync failed: {e}"))?;

    // Close handle before deleting
    drop(file);

    // Delete the file
    fs::remove_file(path).map_err(|e| format!("Delete failed after wipe: {e}"))?;

    Ok(())
}

/// Overwrite the file with one pass of data.
/// `zeros`: if true, write zero bytes; if false, write random bytes.
fn overwrite_pass(file: &mut File, file_size: u64, zeros: bool) -> Result<(), String> {
    file.seek(SeekFrom::Start(0))
        .map_err(|e| format!("Seek failed: {e}"))?;

    let mut rng = rand::thread_rng();
    let mut buf = vec![0u8; WIPE_BUF_SIZE];
    let mut remaining = file_size;

    while remaining > 0 {
        let to_write = remaining.min(buf.len() as u64) as usize;
        let slice = &mut buf[..to_write];

        if !zeros {
            rng.fill_bytes(slice);
        }
        // else: slice is already zeros

        file.write_all(slice)
            .map_err(|e| format!("Write failed: {e}"))?;

        remaining -= to_write as u64;
    }

    file.flush().map_err(|e| format!("Flush failed: {e}"))?;
    file.sync_all().map_err(|e| format!("Sync failed: {e}"))?;

    Ok(())
}

/// Securely wipe all files in a directory (non-recursive).
/// Used when resetting the vault.
pub fn secure_wipe_directory(dir: &Path) -> Result<u64, String> {
    if !dir.exists() {
        return Ok(0);
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Cannot read directory: {e}"))?;

    let mut count: u64 = 0;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Directory entry error: {e}"))?;
        let path = entry.path();
        if path.is_file() {
            secure_delete(&path)?;
            count += 1;
        }
    }

    Ok(count)
}
