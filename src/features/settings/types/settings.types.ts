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
}

export const DEFAULT_SETTINGS: AppSettings = {
  lock_on_minimize: false,
  lock_on_hide: false,
  auto_lock_minutes: 5,
  clipboard_clear_seconds: 15,
  compact_mode: false,
  // Will be overridden at load-time if OS reports prefers-reduced-motion
  enable_animations: true,
};
