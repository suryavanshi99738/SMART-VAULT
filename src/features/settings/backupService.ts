// src/features/settings/backupService.ts
// IPC wrappers for encrypted vault backup export/import (.svault)

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/**
 * Export the vault as an encrypted `.svault` file.
 * Returns an ISO-8601 timestamp of the export.
 */
export async function exportVault(
  masterPassword: string,
  filePath: string
): Promise<string> {
  return tauriInvoke<string>("export_vault", {
    masterPassword,
    filePath,
  });
}

/**
 * Import a `.svault` backup.
 * Returns the number of entries imported.
 */
export async function importVault(
  masterPassword: string,
  filePath: string
): Promise<number> {
  return tauriInvoke<number>("import_vault", {
    masterPassword,
    filePath,
  });
}

/** CSV preview entry as returned by the backend. */
export interface CsvPreviewEntry {
  index: number;
  service_name: string;
  username: string;
  email: string;
  password_preview: string;
  notes: string;
  selected: boolean;
}

/**
 * Parse a CSV file and return a preview with masked passwords.
 */
export async function parseCsvPreview(
  filePath: string
): Promise<CsvPreviewEntry[]> {
  return tauriInvoke<CsvPreviewEntry[]>("parse_csv_preview", { filePath });
}

/**
 * Import selected CSV entries into the vault.
 * Returns the count of entries successfully imported.
 */
export async function importCsvEntries(
  filePath: string,
  selectedIndices: number[]
): Promise<number> {
  return tauriInvoke<number>("import_csv_entries", {
    filePath,
    selectedIndices,
  });
}
