import type {
  VaultEntry,
  VaultEntryPayload,
  GeneratorOptions,
  UnlockResult,
  StrengthResult,
} from "../types/vault.types";

// Safe lazy-import wrapper for Tauri IPC
async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// ── Vault lifecycle ────────────────────────────────────────────────────────────

export async function unlockVault(masterPassword: string): Promise<UnlockResult> {
  return tauriInvoke<UnlockResult>("unlock_vault", {
    // Rust param name is password (the unlock_vault command uses `password: String`)
    password: masterPassword,
  });
}

export async function lockVault(): Promise<boolean> {
  return tauriInvoke<boolean>("lock_vault");
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export async function getAllEntries(): Promise<VaultEntry[]> {
  return tauriInvoke<VaultEntry[]>("get_all_password_entries");
}

export async function addEntry(
  payload: VaultEntryPayload
): Promise<string> {
  // Rust param is `request: AddEntryRequest` — must send key `request`
  return tauriInvoke<string>("add_password_entry", { request: payload });
}

export async function updateEntry(
  id: string,
  payload: VaultEntryPayload
): Promise<void> {
  // Rust param is `request: UpdateEntryRequest` — id lives inside the struct
  return tauriInvoke<void>("update_password_entry", {
    request: { id, ...payload },
  });
}

export async function deleteEntry(id: string): Promise<boolean> {
  return tauriInvoke<boolean>("delete_password_entry", { id });
}

export async function decryptEntryPassword(id: string): Promise<string> {
  return tauriInvoke<string>("decrypt_entry_password", { id });
}

// ── Generator ──────────────────────────────────────────────────────────────────

export async function generatePassword(
  options: GeneratorOptions
): Promise<string> {
  return tauriInvoke<string>("generate_password", { options });
}

// ── Security ───────────────────────────────────────────────────────────────────

export async function clearClipboard(): Promise<void> {
  return tauriInvoke<void>("clear_clipboard");
}

export async function estimatePasswordStrength(
  password: string
): Promise<StrengthResult> {
  return tauriInvoke<StrengthResult>("estimate_password_strength", {
    password,
  });
}

// ── Auth (re-exported for convenience) ─────────────────────────────────────────

export async function setMasterPassword(
  masterPassword: string
): Promise<boolean> {
  return tauriInvoke<boolean>("set_master_password", { password: masterPassword });
}

export async function checkIfMasterExists(): Promise<boolean> {
  return tauriInvoke<boolean>("check_if_master_exists");
}
