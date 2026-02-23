// src-tauri/src/tray.rs
// ─────────────────────────────────────────────────────────────────────────────
// System tray integration for Smart Vault.
//
// • Registers a tray icon at startup with a context menu.
// • Tray menu: Open Vault · Lock Vault · ── · Exit Smart Vault
// • "Open Vault" shows + focuses the main window.
// • "Lock Vault" clears the AES key from VaultState and emits an event
//   so the React frontend can switch to the login view.
// • "Exit" securely wipes state, clears clipboard, and terminates.
// ─────────────────────────────────────────────────────────────────────────────

use crate::security;
use crate::state::VaultState;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

/// Build and attach the system tray. Call once during `setup`.
pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_i = MenuItem::with_id(app, "open_vault", "Open Vault", true, None::<&str>)?;
    let lock_i = MenuItem::with_id(app, "lock_vault", "Lock Vault", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "exit_app", "Exit Smart Vault", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open_i, &lock_i, &sep, &quit_i])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false) // left-click = show window; right-click = menu
        .tooltip("Smart Vault")
        .on_menu_event(move |app, event| {
            let id = event.id().as_ref();
            match id {
                "open_vault" => handle_open(app),
                "lock_vault" => handle_lock(app),
                "exit_app" => handle_exit(app),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                handle_open(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

// ── Handlers ───────────────────────────────────────────────────────────────────

/// Show and focus the main window.
fn handle_open(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Lock the vault (clear encryption key) and notify the frontend.
fn handle_lock(app: &AppHandle) {
    let state = app.state::<Mutex<VaultState>>();
    if let Ok(mut guard) = state.lock() {
        if guard.is_unlocked {
            guard.lock();
            // Tell the frontend to switch back to the login screen
            let _ = app.emit("vault-locked-from-tray", ());
        }
    };
}

/// Securely wipe memory, clear clipboard, and terminate the process.
fn handle_exit(app: &AppHandle) {
    // 1. Zeroize encryption key
    {
        let state = app.state::<Mutex<VaultState>>();
        if let Ok(mut guard) = state.lock() {
            guard.lock();
        };
    }

    // 2. Clear system clipboard (best-effort)
    let _ = security::clear_clipboard_sync();

    // 3. Exit cleanly
    app.exit(0);
}
