mod auth;
mod backup;
mod backup_v2;
mod crypto;
mod db;
mod document_commands;
mod document_crypto;
mod import;
mod multi_vault;
mod secure_wipe;
mod security;
mod settings;
mod shortcut;
mod state;
mod tray;
mod vault_commands;

use std::sync::Mutex;

use tauri::Manager;

use auth::{check_if_master_exists, lock_vault, set_master_password, unlock_vault};
use backup::{export_vault, import_vault};
use backup_v2::{export_vault_backup, import_vault_backup};
use document_commands::{
    cleanup_all_temp_documents, cleanup_temp_document, delete_document, get_all_documents,
    get_document_info, import_document, open_document, secure_delete_document,
};
use import::{import_csv_entries, parse_csv_preview};
use multi_vault::{
    create_vault, delete_vault, get_active_vault_id, list_vaults, rename_vault, select_vault,
};
use security::{clear_clipboard, estimate_password_strength};
use settings::{load_settings, save_settings};
use shortcut::{register_global_shortcut, unregister_global_shortcut};
use state::VaultState;
use vault_commands::{
    add_password_entry, decrypt_entry_password, delete_password_entry, generate_password,
    get_all_password_entries, search_entries, update_password_entry,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(VaultState::new()))
        .invoke_handler(tauri::generate_handler![
            // Auth
            set_master_password,
            check_if_master_exists,
            unlock_vault,
            lock_vault,
            // Vault CRUD
            add_password_entry,
            update_password_entry,
            delete_password_entry,
            get_all_password_entries,
            decrypt_entry_password,
            generate_password,
            search_entries,
            // Security
            clear_clipboard,
            estimate_password_strength,
            // Settings
            load_settings,
            save_settings,
            // Global shortcut
            register_global_shortcut,
            unregister_global_shortcut,
            // Backup (legacy .svault)
            export_vault,
            import_vault,
            // Backup v2 (.smartbackup)
            export_vault_backup,
            import_vault_backup,
            // CSV import
            parse_csv_preview,
            import_csv_entries,
            // Document vault
            import_document,
            open_document,
            cleanup_temp_document,
            cleanup_all_temp_documents,
            delete_document,
            get_all_documents,
            get_document_info,
            secure_delete_document,
            // Multi-vault
            list_vaults,
            create_vault,
            delete_vault,
            rename_vault,
            select_vault,
            get_active_vault_id,
        ])
        .setup(|app| {
            // ── System tray ────────────────────────────────────────────────
            tray::create_tray(app.handle())?;

            // ── Global shortcut ────────────────────────────────────────────
            // Register immediately so the shortcut works before React loads.
            shortcut::init_global_shortcut(app.handle());

            // ── Close-to-tray intercept ────────────────────────────────────
            // If the user enabled "Close to Tray" in settings, hide the
            // window instead of closing. The on_window_event fires before
            // the default close behaviour.
            let handle = app.handle().clone();
            if let Some(win) = app.get_webview_window("main") {
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Load current settings to check close_to_tray flag
                        let close_to_tray = load_settings()
                            .map(|s| s.close_to_tray)
                            .unwrap_or(false);

                        if close_to_tray {
                            // Prevent the window from actually closing
                            api.prevent_close();
                            // Hide instead
                            let _ = handle.get_webview_window("main")
                                .map(|w| w.hide());
                        }
                        // If close_to_tray is false, let the default close happen
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

