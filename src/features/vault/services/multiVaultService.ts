// src/features/vault/services/multiVaultService.ts
// IPC wrappers for multi-vault management and backup v2

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VaultMeta {
  id: string;
  name: string;
  created_at: number;
}

export interface ImportBackupResult {
  imported: number;
  vault_name: string;
}

// ── Multi-vault commands ───────────────────────────────────────────────────────

/** List all vaults in the index. */
export async function listVaults(): Promise<VaultMeta[]> {
  return tauriInvoke<VaultMeta[]>("list_vaults");
}

/** Create a new vault with the given name and master password. */
export async function createVault(
  name: string,
  masterPassword: string
): Promise<VaultMeta> {
  return tauriInvoke<VaultMeta>("create_vault", {
    name,
    masterPassword,
  });
}

/** Delete a vault by ID. Cannot delete the last vault. */
export async function deleteVault(vaultId: string): Promise<boolean> {
  return tauriInvoke<boolean>("delete_vault", { vaultId });
}

/** Rename a vault. */
export async function renameVault(
  vaultId: string,
  newName: string
): Promise<boolean> {
  return tauriInvoke<boolean>("rename_vault", { vaultId, newName });
}

/** Select a vault (does not unlock — call unlock_vault next). */
export async function selectVault(vaultId: string): Promise<boolean> {
  return tauriInvoke<boolean>("select_vault", { vaultId });
}

/** Get the currently active vault ID (may be null). */
export async function getActiveVaultId(): Promise<string | null> {
  return tauriInvoke<string | null>("get_active_vault_id");
}

// ── Backup v2 (.smartbackup) ───────────────────────────────────────────────────

/** Export the active vault as an encrypted .smartbackup file. */
export async function exportVaultBackup(
  filePath: string,
  vaultName: string,
  backupPassword?: string
): Promise<string> {
  return tauriInvoke<string>("export_vault_backup", {
    filePath,
    vaultName,
    backupPassword: backupPassword || null,
  });
}

/** Import a .smartbackup file into the current vault. */
export async function importVaultBackup(
  filePath: string,
  backupPassword?: string
): Promise<ImportBackupResult> {
  return tauriInvoke<ImportBackupResult>("import_vault_backup", {
    filePath,
    backupPassword: backupPassword || null,
  });
}
