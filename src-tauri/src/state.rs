// src-tauri/src/state.rs
// ─────────────────────────────────────────────────────────────────────────────
// Centralized vault runtime state managed by Tauri's dependency-injection
// system (tauri::State / AppHandle::manage).
//
// Security guarantees:
// • encryption_key is stored only in process memory — never serialised to disk
// • Zeroize wipes the key bytes on lock or drop
// • All vault commands receive &State<Mutex<VaultState>> and fail fast if the
//   key is absent — no fallback, no silent bypass
// ─────────────────────────────────────────────────────────────────────────────

use std::time::Instant;
use zeroize::Zeroize;

/// Runtime state injected via `tauri::Builder::manage`.
/// Wrapped in `std::sync::Mutex` so Tauri can share it across threads.
pub struct VaultState {
    /// AES-256 key bytes derived from the master password on unlock.
    /// `None` when the vault is locked.
    pub encryption_key: Option<Vec<u8>>,

    /// Convenience flag — mirrors whether `encryption_key` is `Some`.
    pub is_unlocked: bool,

    /// Consecutive failed password attempts since last success.
    pub failed_attempts: u32,

    /// If set, the timestamp after which a new attempt is permitted.
    pub lockout_until: Option<Instant>,
}

impl VaultState {
    /// Create a fully-locked initial state.
    pub fn new() -> Self {
        Self {
            encryption_key: None,
            is_unlocked: false,
            failed_attempts: 0,
            lockout_until: None,
        }
    }

    /// Return the encryption key bytes or an error if locked.
    /// The returned slice is valid for the lifetime of the MutexGuard.
    pub fn key(&self) -> Result<&[u8], String> {
        match &self.encryption_key {
            Some(k) => Ok(k.as_slice()),
            None => Err("Vault is locked – no encryption key available.".into()),
        }
    }

    /// Store a derived key and mark the vault as unlocked.
    pub fn set_key(&mut self, key: Vec<u8>) {
        // Zeroize any previous key before replacing
        if let Some(ref mut old) = self.encryption_key {
            old.zeroize();
        }
        self.encryption_key = Some(key);
        self.is_unlocked = true;
        self.failed_attempts = 0;
        self.lockout_until = None;
    }

    /// Clear key material, zeroize memory, mark as locked.
    pub fn lock(&mut self) {
        if let Some(ref mut key) = self.encryption_key {
            key.zeroize();
        }
        self.encryption_key = None;
        self.is_unlocked = false;
    }
}

impl Drop for VaultState {
    fn drop(&mut self) {
        // Guarantee zeroization if the state is dropped (e.g. on shutdown)
        self.lock();
    }
}
