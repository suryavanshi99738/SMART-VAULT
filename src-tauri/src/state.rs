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
use zeroize::{Zeroize, ZeroizeOnDrop};

// ── Secure key wrapper ─────────────────────────────────────────────────────────

/// 32-byte AES-256 key that is automatically zeroized when dropped.
/// Prevents key material from lingering in process memory after use.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct VaultKey([u8; 32]);

impl VaultKey {
    /// Create a key initialized to all zeros (for in-place derivation).
    pub fn zeroed() -> Self {
        Self([0u8; 32])
    }

    /// Create a key from a 32-byte array.
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Access the raw key bytes.
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    /// Mutable access for in-place key derivation (e.g. Argon2 output).
    pub fn as_mut_bytes(&mut self) -> &mut [u8] {
        &mut self.0
    }

    /// Create an independent copy. The copy is separately zeroized on drop.
    pub fn duplicate(&self) -> Self {
        Self(self.0)
    }
}

// ── Runtime state ──────────────────────────────────────────────────────────────

/// Runtime state injected via `tauri::Builder::manage`.
/// Wrapped in `std::sync::Mutex` so Tauri can share it across threads.
pub struct VaultState {
    /// AES-256 key derived from the master password on unlock.
    /// `None` when the vault is locked. Auto-zeroized via VaultKey::Drop.
    pub encryption_key: Option<VaultKey>,

    /// Convenience flag — mirrors whether `encryption_key` is `Some`.
    pub is_unlocked: bool,

    /// Consecutive failed password attempts since last success.
    pub failed_attempts: u32,

    /// If set, the timestamp after which a new attempt is permitted.
    pub lockout_until: Option<Instant>,

    /// The UUID of the currently-selected vault (multi-vault support).
    /// `None` if no vault is selected yet.
    pub active_vault_id: Option<String>,
}

impl VaultState {
    /// Create a fully-locked initial state.
    pub fn new() -> Self {
        Self {
            encryption_key: None,
            is_unlocked: false,
            failed_attempts: 0,
            lockout_until: None,
            active_vault_id: None,
        }
    }

    /// Return a reference to the encryption key or an error if locked.
    pub fn key(&self) -> Result<&VaultKey, String> {
        self.encryption_key
            .as_ref()
            .ok_or_else(|| "Vault is locked – no encryption key available.".into())
    }

    /// Store a derived key and mark the vault as unlocked.
    /// Any previous key is automatically zeroized when replaced (VaultKey Drop).
    pub fn set_key(&mut self, key: VaultKey) {
        self.encryption_key = Some(key);
        self.is_unlocked = true;
        self.failed_attempts = 0;
        self.lockout_until = None;
    }

    /// Clear key material, mark as locked.
    /// Setting to `None` drops the VaultKey, triggering automatic zeroization.
    pub fn lock(&mut self) {
        self.encryption_key = None;
        self.is_unlocked = false;
        // Keep active_vault_id so re-login goes to the same vault.
    }

    /// Return the active vault ID or an error.
    pub fn require_vault_id(&self) -> Result<&str, String> {
        self.active_vault_id
            .as_deref()
            .ok_or_else(|| "No vault selected.".into())
    }
}

impl Drop for VaultState {
    fn drop(&mut self) {
        // Guarantee zeroization if the state is dropped (e.g. on shutdown)
        self.lock();
    }
}
