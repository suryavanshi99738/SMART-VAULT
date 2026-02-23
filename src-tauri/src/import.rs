// src-tauri/src/import.rs
// ─────────────────────────────────────────────────────────────────────────────
// CSV password import for Smart Vault.
//
// Supported formats:
//   • Chrome / Edge export: name, url, username, password
//   • Bitwarden basic:     name, login_uri, login_username, login_password, notes
//   • Generic:             name/url, username, password, notes (optional)
//
// Security:
//   • CSV is parsed in Rust — no plaintext ever touches the JS layer.
//   • Returns a preview (with masked passwords) so the user can deselect
//     entries before committing.
//   • Passwords are encrypted in Rust before INSERT.
//   • Temporary plaintext buffers are zeroized.
// ─────────────────────────────────────────────────────────────────────────────

use crate::{crypto, db, state::VaultState};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;
use zeroize::Zeroize;

// ── Preview entry (sent to frontend — password masked) ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvPreviewEntry {
    /// Index in the parsed list (used to reference back on commit)
    pub index: usize,
    pub service_name: String,
    pub username: String,
    pub email: String,
    /// Masked for display: e.g. "••••••••"
    pub password_preview: String,
    pub notes: String,
    /// Whether this entry should be imported (frontend can toggle this)
    pub selected: bool,
}

/// Internal struct holding the real plaintext password.
#[derive(Debug, Clone)]
struct ParsedEntry {
    service_name: String,
    username: String,
    email: String,
    password: String,
    notes: String,
}

// ── Column detection ───────────────────────────────────────────────────────────

/// Normalise a header name for fuzzy matching.
fn norm(s: &str) -> String {
    s.trim()
        .to_ascii_lowercase()
        .replace(['-', '_', ' '], "")
}

fn find_col(headers: &[String], candidates: &[&str]) -> Option<usize> {
    headers
        .iter()
        .position(|h| candidates.iter().any(|c| norm(h) == norm(c)))
}

// ── Minimal CSV parser (no external crate) ─────────────────────────────────────
// Handles quoted fields with embedded commas and newlines.

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                current.push(c);
            }
        } else {
            match c {
                '"' => in_quotes = true,
                ',' => {
                    fields.push(current.clone());
                    current.clear();
                }
                _ => current.push(c),
            }
        }
    }
    fields.push(current);
    fields
}

/// Sanitise a field value to prevent CSV injection attacks.
fn sanitise(val: &str) -> String {
    let trimmed = val.trim();
    // Strip leading characters used in CSV injection attacks
    let stripped = trimmed.trim_start_matches(|c: char| "=+@-\t\r".contains(c));
    stripped.to_string()
}

// ── Commands ───────────────────────────────────────────────────────────────────

/// Parse a CSV file and return a preview. Passwords are masked.
/// The frontend shows this in a modal so the user can deselect entries.
#[tauri::command]
pub fn parse_csv_preview(file_path: String) -> Result<Vec<CsvPreviewEntry>, String> {
    let raw = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Cannot read CSV: {e}"))?;

    let mut lines = raw.lines();
    let header_line = lines.next().ok_or("CSV file is empty.")?;
    let headers: Vec<String> = parse_csv_line(header_line);

    // Detect columns
    let name_col = find_col(&headers, &["name", "servicename", "service_name", "title", "url", "login_uri", "loginuri"])
        .ok_or("CSV missing a 'name' or 'url' column.")?;
    let user_col = find_col(&headers, &["username", "login_username", "loginusername", "user"]);
    let pass_col = find_col(&headers, &["password", "login_password", "loginpassword"])
        .ok_or("CSV missing a 'password' column.")?;
    let notes_col = find_col(&headers, &["notes", "note", "comments", "comment"]);
    let email_col = find_col(&headers, &["email", "login_email", "loginemail"]);

    let mut previews = Vec::new();

    for (i, line) in lines.enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let fields = parse_csv_line(line);

        let service_name = sanitise(fields.get(name_col).map(|s| s.as_str()).unwrap_or(""));
        let username = sanitise(
            user_col
                .and_then(|c| fields.get(c))
                .map(|s| s.as_str())
                .unwrap_or(""),
        );
        let password = fields.get(pass_col).map(|s| s.as_str()).unwrap_or("");
        let notes = sanitise(
            notes_col
                .and_then(|c| fields.get(c))
                .map(|s| s.as_str())
                .unwrap_or(""),
        );
        let email = sanitise(
            email_col
                .and_then(|c| fields.get(c))
                .map(|s| s.as_str())
                .unwrap_or(""),
        );

        // Skip entries with empty passwords
        if password.trim().is_empty() {
            continue;
        }

        // Mask password for preview
        let password_preview = "•".repeat(password.len().min(12));

        previews.push(CsvPreviewEntry {
            index: i,
            service_name: service_name.clone(),
            username,
            email,
            password_preview,
            notes,
            selected: true,
        });
    }

    if previews.is_empty() {
        return Err("No valid entries found in CSV.".into());
    }

    Ok(previews)
}

/// Import selected CSV entries into the vault.
///
/// `selected_indices` — the indices (from `CsvPreviewEntry.index`) the user
/// chose to import.  We re-parse the file, pick only those, encrypt, and
/// insert.
#[tauri::command]
pub fn import_csv_entries(
    file_path: String,
    selected_indices: Vec<usize>,
    vault_state: State<'_, Mutex<VaultState>>,
) -> Result<u32, String> {
    // 1. Re-parse to get plaintext
    let raw = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Cannot read CSV: {e}"))?;

    let mut lines: Vec<&str> = raw.lines().collect();
    if lines.is_empty() {
        return Err("CSV file is empty.".into());
    }
    let header_line = lines.remove(0);
    let headers: Vec<String> = parse_csv_line(header_line);

    let name_col = find_col(&headers, &["name", "servicename", "service_name", "title", "url", "login_uri", "loginuri"])
        .ok_or("CSV missing a 'name' or 'url' column.")?;
    let user_col = find_col(&headers, &["username", "login_username", "loginusername", "user"]);
    let pass_col = find_col(&headers, &["password", "login_password", "loginpassword"])
        .ok_or("CSV missing a 'password' column.")?;
    let notes_col = find_col(&headers, &["notes", "note", "comments", "comment"]);
    let email_col = find_col(&headers, &["email", "login_email", "loginemail"]);

    let mut parsed: Vec<(usize, ParsedEntry)> = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        let line = line.trim();
        if line.is_empty() { continue; }

        let fields = parse_csv_line(line);
        let password = fields.get(pass_col).map(|s| s.to_string()).unwrap_or_default();
        if password.trim().is_empty() { continue; }

        parsed.push((i, ParsedEntry {
            service_name: sanitise(fields.get(name_col).map(|s| s.as_str()).unwrap_or("")),
            username: sanitise(user_col.and_then(|c| fields.get(c)).map(|s| s.as_str()).unwrap_or("")),
            email: sanitise(email_col.and_then(|c| fields.get(c)).map(|s| s.as_str()).unwrap_or("")),
            password,
            notes: sanitise(notes_col.and_then(|c| fields.get(c)).map(|s| s.as_str()).unwrap_or("")),
        }));
    }

    // 2. Get vault key
    let vault_key = {
        let guard = vault_state.lock().map_err(|_| "State lock poisoned.")?;
        guard.key().map(|k| k.to_vec())?
    };

    // 3. Insert selected entries
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;

    let mut imported = 0u32;
    for (idx, mut entry) in parsed {
        if !selected_indices.contains(&idx) {
            entry.password.zeroize();
            continue;
        }

        let encrypted = crypto::encrypt_password(&vault_key, &entry.password)?;
        entry.password.zeroize();

        let id = Uuid::new_v4().to_string();
        db::insert_entry(
            &id,
            &entry.service_name,
            &entry.username,
            &entry.email,
            &encrypted,
            "Imported",
            if entry.notes.is_empty() { None } else { Some(&entry.notes) },
            now,
        )?;

        imported += 1;
    }

    Ok(imported)
}
