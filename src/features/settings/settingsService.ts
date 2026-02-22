// src/features/settings/settingsService.ts
// IPC wrappers for load_settings / save_settings Tauri commands.

import type { AppSettings } from "./types/settings.types";
import { DEFAULT_SETTINGS } from "./types/settings.types";

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** Load settings from disk. Falls back to defaults on any error. */
export async function loadSettings(): Promise<AppSettings> {
  try {
    return await tauriInvoke<AppSettings>("load_settings");
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist settings to disk. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  return tauriInvoke<void>("save_settings", { settings });
}
