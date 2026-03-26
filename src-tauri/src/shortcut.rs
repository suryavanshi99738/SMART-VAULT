// src-tauri/src/shortcut.rs
// ─────────────────────────────────────────────────────────────────────────────
// Global hotkey management for Smart Vault.
//
// • Default shortcut: Ctrl+Alt+V
// • Brings the window to the foreground when vault is minimised / in tray.
// • Does NOT auto-unlock — user must authenticate if the vault is locked.
// • Shortcut can be changed or disabled from the settings panel.
// ─────────────────────────────────────────────────────────────────────────────

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

// ── Internal helper (shared by setup + command) ────────────────────────────

/// Core registration logic used by both `init_global_shortcut` (setup) and
/// the `register_global_shortcut` IPC command.
fn register_shortcut_inner(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    // Unregister everything first so we don't stack listeners
    let _ = app.global_shortcut().unregister_all();

    let app_handle = app.clone();

    println!("[shortcut] registering global shortcut: {accelerator}");

    app.global_shortcut()
        .on_shortcut(accelerator, move |_app, shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                println!("[shortcut] triggered: {shortcut}");
                if let Some(win) = app_handle.get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.unminimize();
                        let _ = win.set_focus();
                    }
                } else {
                    eprintln!("[shortcut] window \"main\" not found");
                }
            }
        })
        .map_err(|e| {
            let msg = format!("Failed to register shortcut \"{accelerator}\": {e}");
            eprintln!("[shortcut] {msg}");
            msg
        })?;

    println!("[shortcut] registered successfully: {accelerator}");
    Ok(())
}

// ── Public API called from lib.rs setup ────────────────────────────────────

/// Register the global shortcut at app startup based on persisted settings.
/// Called once from the Tauri `setup` block so the shortcut works immediately
/// without waiting for the frontend to load.
pub fn init_global_shortcut(app: &AppHandle) {
    let settings = crate::settings::load_settings().unwrap_or_default();

    if !settings.global_shortcut_enabled || settings.global_shortcut.is_empty() {
        println!("[shortcut] disabled in settings — skipping registration");
        return;
    }

    if let Err(e) = register_shortcut_inner(app, &settings.global_shortcut) {
        eprintln!("[shortcut] startup registration failed: {e}");
    }
}

// ── Tauri commands (called from frontend) ──────────────────────────────────

/// Register the global shortcut.  Call in `setup` and whenever the user changes
/// the keybinding in settings.
///
/// `accelerator` follows Electron-style: e.g. `"Ctrl+Alt+V"`, `"CmdOrCtrl+K"`.
#[tauri::command]
pub fn register_global_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    register_shortcut_inner(&app, &accelerator)
}

/// Unregister all global shortcuts (e.g. when the user disables the feature).
#[tauri::command]
pub fn unregister_global_shortcut(app: AppHandle) -> Result<(), String> {
    println!("[shortcut] unregistering all shortcuts");
    app.global_shortcut().unregister_all().map_err(|e| {
        let msg = format!("Failed to unregister shortcuts: {e}");
        eprintln!("[shortcut] {msg}");
        msg
    })
}
