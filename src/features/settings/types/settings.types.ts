// src/features/settings/types/settings.types.ts
// Mirrors the Rust AppSettings struct in src-tauri/src/settings.rs

export interface AppSettings {
  /** Lock vault when the app window is minimized */
  lock_on_minimize: boolean;
  /** Lock vault when the app window loses focus (switches to another app) */
  lock_on_hide: boolean;
  /** Minutes of inactivity before auto-lock (used by useAutoLock) */
  auto_lock_minutes: number;
  /** Seconds before clipboard is cleared after copying a password */
  clipboard_clear_seconds: number;
  /** Reduce UI spacing to fit more content on screen */
  compact_mode: boolean;
  /**
   * Allow UI transition and animation effects.
   * The app auto-detects prefers-reduced-motion on first launch and stores
   * the result so the user's stored preference is always respected.
   */
  enable_animations: boolean;
  /** Minimise motion — replaces slide/scale with fade-only transitions */
  reduced_motion: boolean;
  /** Skip unlock transition entirely for fastest vault access */
  instant_unlock: boolean;
  // ── Window & tray ──────────────────────────────────────────────────────────
  /** Hide to tray instead of quitting when the window close button is clicked */
  close_to_tray: boolean;
  /** Restore last window position/size on relaunch */
  restore_window_state: boolean;
  // ── Global shortcut ────────────────────────────────────────────────────────
  /** Whether the global keyboard shortcut is active */
  global_shortcut_enabled: boolean;
  /** Accelerator string, e.g. "Ctrl+Alt+V" */
  global_shortcut: string;
  // ── Backup ─────────────────────────────────────────────────────────────────
  /** ISO-8601 timestamp of the last successful backup export */
  last_backup_date: string | null;
  /** Periodically remind the user to back up the vault */
  backup_reminder: boolean;
  // ── Document storage ───────────────────────────────────────────────────────
  /** Auto-cleanup temp decrypted documents after this many minutes (0 = manual only) */
  doc_auto_cleanup_minutes: number;
  /** Use secure (multi-pass overwrite) deletion for document files */
  doc_secure_delete: boolean;
  /** Chunk size in megabytes for document encryption (1–16 MB) */
  doc_chunk_size_mb: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  lock_on_minimize: false,
  lock_on_hide: false,
  auto_lock_minutes: 5,
  clipboard_clear_seconds: 15,
  compact_mode: false,
  // Will be overridden at load-time if OS reports prefers-reduced-motion
  enable_animations: true,
  reduced_motion: false,
  instant_unlock: false,
  close_to_tray: false,
  restore_window_state: false,
  global_shortcut_enabled: true,
  global_shortcut: "Ctrl+Alt+V",
  last_backup_date: null,
  backup_reminder: false,
  doc_auto_cleanup_minutes: 5,
  doc_secure_delete: true,
  doc_chunk_size_mb: 4,
};
