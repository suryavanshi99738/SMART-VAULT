mod auth;
mod crypto;
mod db;
mod security;
mod settings;
mod state;
mod vault_commands;

use std::sync::Mutex;

use auth::{check_if_master_exists, lock_vault, set_master_password, unlock_vault};
use security::{clear_clipboard, estimate_password_strength};
use settings::{load_settings, save_settings};
use state::VaultState;
use vault_commands::{
    add_password_entry, decrypt_entry_password, delete_password_entry, generate_password,
    get_all_password_entries, search_entries, update_password_entry,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(VaultState::new()))
        .invoke_handler(tauri::generate_handler![
            set_master_password,
            check_if_master_exists,
            unlock_vault,
            lock_vault,
            add_password_entry,
            update_password_entry,
            delete_password_entry,
            get_all_password_entries,
            decrypt_entry_password,
            generate_password,
            search_entries,
            clear_clipboard,
            estimate_password_strength,
            load_settings,
            save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
