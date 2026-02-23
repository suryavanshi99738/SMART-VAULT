// src-tauri/src/settings.rs
// ─────────────────────────────────────────────────────────────────────────────
// Non-sensitive application settings persisted as plain JSON.
//
// Security notes:
// • This file NEVER stores vault data or encryption material.
// • Settings are read/written with normal filesystem permissions.
// • All fields have safe defaults so the app works without a config file.
// ─────────────────────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

// ── Settings model ─────────────────────────────────────────────────────────────

/// All persisted user preferences.
/// Any new field MUST have a `#[serde(default)]` so old config files
/// remain valid after an upgrade.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// Lock the vault automatically when the window is minimized.
    #[serde(default)]
    pub lock_on_minimize: bool,

    /// Lock the vault automatically when the window loses focus
    /// (user switches to another application).
    #[serde(default)]
    pub lock_on_hide: bool,

    /// Minutes of inactivity before the vault auto-locks (0 = disabled).
    #[serde(default = "default_auto_lock_minutes")]
    pub auto_lock_minutes: u32,

    /// Seconds before a copied password is cleared from the clipboard.
    #[serde(default = "default_clipboard_clear_seconds")]
    pub clipboard_clear_seconds: u32,

    /// Reduce padding and spacing to fit more items on screen.
    #[serde(default)]
    pub compact_mode: bool,

    /// Allow UI transitions and animation effects.
    /// Defaults to `true`; the frontend will override with `false` if the OS
    /// reports `prefers-reduced-motion` and no user preference is saved yet.
    #[serde(default = "default_enable_animations")]
    pub enable_animations: bool,

    /// Minimise motion for accessibility — replaces slide/scale with opacity-only.
    #[serde(default)]
    pub reduced_motion: bool,

    /// Skip the unlock transition entirely for fastest vault access.
    #[serde(default)]
    pub instant_unlock: bool,

    // ── Window & tray behaviour ────────────────────────────────────────────

    /// Intercept the window close button and hide to tray instead.
    #[serde(default)]
    pub close_to_tray: bool,

    /// Restore the last window position/size on relaunch.
    #[serde(default)]
    pub restore_window_state: bool,

    // ── Global shortcut ────────────────────────────────────────────────────

    /// Whether the global shortcut is active.
    #[serde(default = "default_true")]
    pub global_shortcut_enabled: bool,

    /// Accelerator string, e.g. "Ctrl+Shift+V".
    #[serde(default = "default_shortcut")]
    pub global_shortcut: String,

    // ── Backup ─────────────────────────────────────────────────────────────

    /// ISO-8601 timestamp of the last successful export, if any.
    #[serde(default)]
    pub last_backup_date: Option<String>,

    /// Periodically remind the user to back up the vault.
    #[serde(default)]
    pub backup_reminder: bool,
}

fn default_auto_lock_minutes() -> u32 { 5 }
fn default_clipboard_clear_seconds() -> u32 { 15 }
fn default_enable_animations() -> bool { true }
fn default_true() -> bool { true }
fn default_shortcut() -> String { "Ctrl+Shift+V".to_string() }

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            lock_on_minimize: false,
            lock_on_hide: false,
            auto_lock_minutes: default_auto_lock_minutes(),
            clipboard_clear_seconds: default_clipboard_clear_seconds(),
            compact_mode: false,
            enable_animations: default_enable_animations(),
            reduced_motion: false,
            instant_unlock: false,
            close_to_tray: false,
            restore_window_state: false,
            global_shortcut_enabled: true,
            global_shortcut: default_shortcut(),
            last_backup_date: None,
            backup_reminder: false,
        }
    }
}

// ── Filesystem helpers ─────────────────────────────────────────────────────────

fn settings_path() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "Cannot resolve app-data directory.".to_string())?
        .join("com.hp.smart-vault");

    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create app directory: {e}"))?;
    }

    Ok(dir.join("settings.json"))
}

// ── Tauri commands ─────────────────────────────────────────────────────────────

/// Load persisted settings from disk.
/// Returns safe defaults if the file does not exist or is corrupted.
#[tauri::command]
pub fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path()?;

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings: {e}"))?;

    if raw.trim().is_empty() {
        return Ok(AppSettings::default());
    }

    // If the file is corrupted / from an older schema, reset to defaults
    // rather than crashing.
    serde_json::from_str::<AppSettings>(&raw).or_else(|_| {
        // Best-effort: overwrite corrupted file with defaults
        let defaults = AppSettings::default();
        let _ = save_settings_inner(&defaults);
        Ok(defaults)
    })
}

/// Persist settings to disk atomically (write to temp + rename).
#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    save_settings_inner(&settings)
}

fn save_settings_inner(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path()?;

    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Serialisation error: {e}"))?;

    // Write to a temp file first to prevent partial writes
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &json)
        .map_err(|e| format!("Failed to write settings (tmp): {e}"))?;

    fs::rename(&tmp, &path)
        .map_err(|e| format!("Failed to finalise settings write: {e}"))?;

    Ok(())
}
