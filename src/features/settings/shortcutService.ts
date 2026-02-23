// src/features/settings/shortcutService.ts
// IPC + JS-side wrappers for global keyboard shortcut management

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** Register a global keyboard shortcut (e.g. "Ctrl+Shift+V"). */
export async function registerGlobalShortcut(
  accelerator: string
): Promise<void> {
  return tauriInvoke<void>("register_global_shortcut", { accelerator });
}

/** Unregister all global shortcuts. */
export async function unregisterGlobalShortcut(): Promise<void> {
  return tauriInvoke<void>("unregister_global_shortcut");
}
