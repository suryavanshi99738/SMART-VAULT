// src-tauri/src/db.rs
// ─────────────────────────────────────────────────────────────────────────────
// SQLite database layer for Smart Vault password entries.
//
// • Database stored in OS app-data directory
// • Schema auto-migrated on first connection
// • All operations use parameterised queries to prevent injection
// ─────────────────────────────────────────────────────────────────────────────

use rusqlite::{params, Connection};
use serde::Serialize;
use std::{fs, path::PathBuf, sync::Mutex};

use crate::document_commands::SecureDocument;

/// Global database connection, initialised once at startup.
static DB: Mutex<Option<Connection>> = Mutex::new(None);

// ── Data types ─────────────────────────────────────────────────────────────────

/// Row representation returned to the frontend.
/// `encrypted_password` is base64-encoded so it travels safely over JSON.
#[derive(Debug, Clone, Serialize)]
pub struct PasswordEntry {
    pub id: String,
    pub service_name: String,
    pub username: String,
    pub email: String,
    pub encrypted_password: String, // base64
    pub category: String,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/// Base app-data directory for Smart Vault.
pub fn app_data_dir() -> Result<PathBuf, String> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| "Unable to determine app data directory.".to_string())?;
    let app_dir = data_dir.join("com.hp.smart-vault");
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app directory: {e}"))?;
    }
    Ok(app_dir)
}

/// Resolve the database path for a specific vault.
pub fn db_path_for_vault(vault_id: &str) -> Result<PathBuf, String> {
    let vaults_dir = app_data_dir()?.join("vaults").join(vault_id);
    if !vaults_dir.exists() {
        fs::create_dir_all(&vaults_dir)
            .map_err(|e| format!("Failed to create vault directory: {e}"))?;
    }
    Ok(vaults_dir.join("vault.db"))
}

/// Legacy fallback — resolve the single-vault database path.
fn db_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("vault.db"))
}

// ── Initialisation ─────────────────────────────────────────────────────────────

/// Open (or create) the SQLite database and run migrations.
pub fn init_db() -> Result<(), String> {
    let path = db_path()?;
    init_db_at_path(&path)
}

/// Open (or create) the SQLite database for a specific vault.
pub fn init_db_for_vault(vault_id: &str) -> Result<(), String> {
    let path = db_path_for_vault(vault_id)?;
    init_db_at_path(&path)
}

/// Close the current database connection (for vault switching).
pub fn close_db() -> Result<(), String> {
    let mut guard = DB.lock().map_err(|_| "DB lock poisoned.".to_string())?;
    *guard = None;
    Ok(())
}

/// Internal: open DB at a given path and run migrations.
fn init_db_at_path(path: &PathBuf) -> Result<(), String> {

    let conn = Connection::open(&path)
        .map_err(|e| format!("Failed to open database: {e}"))?;

    // Enable WAL mode for better concurrent read performance
    conn.execute_batch("PRAGMA journal_mode = WAL;")
        .map_err(|e| format!("Failed to set WAL mode: {e}"))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS passwords (
            id                  TEXT PRIMARY KEY,
            service_name        TEXT NOT NULL,
            username            TEXT NOT NULL,
            email               TEXT NOT NULL DEFAULT '',
            encrypted_password  BLOB NOT NULL,
            category            TEXT NOT NULL DEFAULT 'General',
            notes               TEXT,
            created_at          INTEGER NOT NULL,
            updated_at          INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Schema migration failed: {e}"))?;

    // Migration: add columns for existing databases
    let _ = conn.execute("ALTER TABLE passwords ADD COLUMN email TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE passwords ADD COLUMN category TEXT NOT NULL DEFAULT 'General'", []);

    // ── Documents table ────────────────────────────────────────────────────
    conn.execute(
        "CREATE TABLE IF NOT EXISTS documents (
            id                  TEXT PRIMARY KEY,
            name                TEXT NOT NULL,
            encrypted_file_name TEXT NOT NULL,
            original_extension  TEXT NOT NULL DEFAULT '',
            size                INTEGER NOT NULL,
            has_password        INTEGER NOT NULL DEFAULT 0,
            password_salt       TEXT,
            created_at          INTEGER NOT NULL,
            updated_at          INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Documents schema migration failed: {e}"))?;

    // Migration: add password_salt column for existing databases
    let _ = conn.execute("ALTER TABLE documents ADD COLUMN password_salt TEXT", []);

    let mut guard = DB.lock().map_err(|_| "DB lock poisoned.".to_string())?;
    *guard = Some(conn);

    Ok(())
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

/// Acquire a reference to the database connection.
fn with_db<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let guard = DB.lock().map_err(|_| "DB lock poisoned.".to_string())?;
    match &*guard {
        Some(conn) => f(conn),
        None => Err("Database not initialised.".into()),
    }
}

/// Insert a new password entry.
pub fn insert_entry(
    id: &str,
    service_name: &str,
    username: &str,
    email: &str,
    encrypted_password: &[u8],
    category: &str,
    notes: Option<&str>,
    created_at: i64,
) -> Result<(), String> {
    with_db(|conn| {
        conn.execute(
            "INSERT INTO passwords (id, service_name, username, email, encrypted_password, category, notes, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, service_name, username, email, encrypted_password, category, notes, created_at, created_at],
        )
        .map_err(|e| format!("Insert failed: {e}"))?;
        Ok(())
    })
}

/// Update an existing password entry.
pub fn update_entry(
    id: &str,
    service_name: &str,
    username: &str,
    email: &str,
    encrypted_password: &[u8],
    category: &str,
    notes: Option<&str>,
    updated_at: i64,
) -> Result<(), String> {
    with_db(|conn| {
        let rows = conn
            .execute(
                "UPDATE passwords
                 SET service_name = ?1, username = ?2, email = ?3, encrypted_password = ?4, category = ?5, notes = ?6, updated_at = ?7
                 WHERE id = ?8",
                params![service_name, username, email, encrypted_password, category, notes, updated_at, id],
            )
            .map_err(|e| format!("Update failed: {e}"))?;

        if rows == 0 {
            return Err("Entry not found.".into());
        }
        Ok(())
    })
}

/// Delete an entry by ID.
pub fn delete_entry(id: &str) -> Result<(), String> {
    with_db(|conn| {
        let rows = conn
            .execute("DELETE FROM passwords WHERE id = ?1", params![id])
            .map_err(|e| format!("Delete failed: {e}"))?;

        if rows == 0 {
            return Err("Entry not found.".into());
        }
        Ok(())
    })
}

/// Retrieve all entries. Encrypted passwords are base64-encoded for JSON transport.
pub fn get_all_entries() -> Result<Vec<PasswordEntry>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, service_name, username, email, encrypted_password, category, notes, created_at, updated_at
                 FROM passwords ORDER BY updated_at DESC",
            )
            .map_err(|e| format!("Query prepare failed: {e}"))?;

        let rows = stmt
            .query_map([], |row| {
                let raw_blob: Vec<u8> = row.get(4)?;
                Ok(PasswordEntry {
                    id: row.get(0)?,
                    service_name: row.get(1)?,
                    username: row.get(2)?,
                    email: row.get(3)?,
                    encrypted_password: base64_encode(&raw_blob),
                    category: row.get(5)?,
                    notes: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|e| format!("Query failed: {e}"))?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(row.map_err(|e| format!("Row read failed: {e}"))?);
        }
        Ok(entries)
    })
}

// ── Document CRUD ──────────────────────────────────────────────────────────────

/// Insert a new document metadata entry.
pub fn insert_document(
    id: &str,
    name: &str,
    encrypted_file_name: &str,
    original_extension: &str,
    size: u64,
    has_password: bool,
    password_salt: Option<&str>,
    created_at: i64,
) -> Result<(), String> {
    with_db(|conn| {
        conn.execute(
            "INSERT INTO documents (id, name, encrypted_file_name, original_extension, size, has_password, password_salt, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, name, encrypted_file_name, original_extension, size, has_password as i32, password_salt, created_at, created_at],
        )
        .map_err(|e| format!("Insert document failed: {e}"))?;
        Ok(())
    })
}

/// Retrieve a single document by ID.
pub fn get_document(id: &str) -> Result<Option<SecureDocument>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, encrypted_file_name, original_extension, size, has_password, created_at, updated_at
                 FROM documents WHERE id = ?1",
            )
            .map_err(|e| format!("Query prepare failed: {e}"))?;

        let mut rows = stmt
            .query_map(params![id], |row| {
                let has_pw: i32 = row.get(5)?;
                Ok(SecureDocument {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    encrypted_file_name: row.get(2)?,
                    original_extension: row.get(3)?,
                    size: row.get(4)?,
                    has_password: has_pw != 0,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .map_err(|e| format!("Query failed: {e}"))?;

        match rows.next() {
            Some(Ok(doc)) => Ok(Some(doc)),
            Some(Err(e)) => Err(format!("Row read failed: {e}")),
            None => Ok(None),
        }
    })
}

/// Retrieve a single document by ID, including the password_salt.
/// Returns (SecureDocument, Option<password_salt_hex>).
pub fn get_document_with_salt(id: &str) -> Result<Option<(SecureDocument, Option<String>)>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, encrypted_file_name, original_extension, size, has_password, created_at, updated_at, password_salt
                 FROM documents WHERE id = ?1",
            )
            .map_err(|e| format!("Query prepare failed: {e}"))?;

        let mut rows = stmt
            .query_map(params![id], |row| {
                let has_pw: i32 = row.get(5)?;
                let salt: Option<String> = row.get(8)?;
                Ok((
                    SecureDocument {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        encrypted_file_name: row.get(2)?,
                        original_extension: row.get(3)?,
                        size: row.get(4)?,
                        has_password: has_pw != 0,
                        created_at: row.get(6)?,
                        updated_at: row.get(7)?,
                    },
                    salt,
                ))
            })
            .map_err(|e| format!("Query failed: {e}"))?;

        match rows.next() {
            Some(Ok(pair)) => Ok(Some(pair)),
            Some(Err(e)) => Err(format!("Row read failed: {e}")),
            None => Ok(None),
        }
    })
}

/// Retrieve all document metadata entries.
pub fn get_all_documents() -> Result<Vec<SecureDocument>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, encrypted_file_name, original_extension, size, has_password, created_at, updated_at
                 FROM documents ORDER BY updated_at DESC",
            )
            .map_err(|e| format!("Query prepare failed: {e}"))?;

        let rows = stmt
            .query_map([], |row| {
                let has_pw: i32 = row.get(5)?;
                Ok(SecureDocument {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    encrypted_file_name: row.get(2)?,
                    original_extension: row.get(3)?,
                    size: row.get(4)?,
                    has_password: has_pw != 0,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .map_err(|e| format!("Query failed: {e}"))?;

        let mut docs = Vec::new();
        for row in rows {
            docs.push(row.map_err(|e| format!("Row read failed: {e}"))?);
        }
        Ok(docs)
    })
}

/// Delete a document metadata entry by ID.
pub fn delete_document(id: &str) -> Result<(), String> {
    with_db(|conn| {
        let rows = conn
            .execute("DELETE FROM documents WHERE id = ?1", params![id])
            .map_err(|e| format!("Delete document failed: {e}"))?;

        if rows == 0 {
            return Err("Document not found.".into());
        }
        Ok(())
    })
}

// ── Base64 helpers (no extra crate needed) ─────────────────────────────────────

const B64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(input: &[u8]) -> String {
    let mut result = String::new();
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(B64_CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(B64_CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(B64_CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(B64_CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

pub fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let input = input.trim_end_matches('=');
    let mut output = Vec::new();

    let lookup = |c: u8| -> Result<u32, String> {
        match c {
            b'A'..=b'Z' => Ok((c - b'A') as u32),
            b'a'..=b'z' => Ok((c - b'a' + 26) as u32),
            b'0'..=b'9' => Ok((c - b'0' + 52) as u32),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err(format!("Invalid base64 character: {}", c as char)),
        }
    };

    let bytes = input.as_bytes();
    let chunks = bytes.chunks(4);
    for chunk in chunks {
        let vals: Vec<u32> = chunk
            .iter()
            .map(|&b| lookup(b))
            .collect::<Result<_, _>>()?;

        if vals.len() >= 2 {
            output.push(((vals[0] << 2) | (vals[1] >> 4)) as u8);
        }
        if vals.len() >= 3 {
            output.push((((vals[1] & 0xF) << 4) | (vals[2] >> 2)) as u8);
        }
        if vals.len() >= 4 {
            output.push((((vals[2] & 0x3) << 6) | vals[3]) as u8);
        }
    }

    Ok(output)
}
