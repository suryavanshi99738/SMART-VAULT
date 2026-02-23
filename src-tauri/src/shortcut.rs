// src-tauri/src/shortcut.rs
// ─────────────────────────────────────────────────────────────────────────────
// Global hotkey management for Smart Vault.
//
// • Default shortcut: Ctrl+Shift+V
// • Brings the window to the foreground when vault is minimised / in tray.
// • Does NOT auto-unlock — user must authenticate if the vault is locked.
// • Shortcut can be changed or disabled from the settings panel.
// ─────────────────────────────────────────────────────────────────────────────

use tauri::{AppHandle, Manager};

/// Register the global shortcut.  Call in `setup` and whenever the user changes
/// the keybinding in settings.
///
/// `accelerator` follows Electron-style: e.g. `"Ctrl+Shift+V"`, `"CmdOrCtrl+K"`.
#[tauri::command]
pub fn register_global_shortcut(
    app: AppHandle,
    accelerator: String,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    // Unregister everything first so we don't stack listeners
    let _ = app.global_shortcut().unregister_all();

    let app_handle = app.clone();

    app.global_shortcut()
        .on_shortcut(
            accelerator.as_str(),
            move |_app, _shortcut, event| {
                // `event` is &ShortcutEvent — check if the state is Pressed
                if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    if let Some(win) = app_handle.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.unminimize();
                        let _ = win.set_focus();
                    }
                }
            },
        )
        .map_err(|e| format!("Failed to register shortcut: {e}"))
}

/// Unregister all global shortcuts (e.g. when the user disables the feature).
#[tauri::command]
pub fn unregister_global_shortcut(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister shortcuts: {e}"))
}
