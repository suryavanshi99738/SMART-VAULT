// src/features/documents/services/documentService.ts
// IPC wrappers for document vault Tauri commands.

import type { SecureDocument } from "../types/document.types";

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/**
 * Import and encrypt a file into the document vault.
 * @param sourcePath  Absolute path of the source file on disk.
 * @param documentName  User-provided display name.
 * @param hasPassword  Whether to add document-level password protection.
 * @param chunkSizeMb  Encryption chunk size in megabytes (0 = default 4 MB).
 * @param documentPassword  Password for document-level encryption (required if hasPassword).
 */
export async function importDocument(
  sourcePath: string,
  documentName: string,
  hasPassword: boolean = false,
  chunkSizeMb: number = 0,
  documentPassword?: string
): Promise<SecureDocument> {
  // Convert MB → bytes for the Rust command (0 = let Rust use default)
  const chunkSize = chunkSizeMb > 0 ? chunkSizeMb * 1024 * 1024 : 0;
  return tauriInvoke<SecureDocument>("import_document", {
    sourcePath,
    documentName,
    hasPassword,
    documentPassword: hasPassword ? documentPassword : null,
    chunkSize,
  });
}

/**
 * Decrypt a document to a temp file, open with OS default app, and return the temp path.
 * For password-protected docs, caller must provide the document password.
 */
export async function openDocument(
  documentId: string,
  documentPassword?: string
): Promise<string> {
  return tauriInvoke<string>("open_document", {
    documentId,
    documentPassword: documentPassword || null,
  });
}

/** Securely wipe a temporary decrypted file. */
export async function cleanupTempDocument(tempPath: string): Promise<void> {
  return tauriInvoke<void>("cleanup_temp_document", { tempPath });
}

/** Securely wipe ALL temporary decrypted files. */
export async function cleanupAllTempDocuments(): Promise<number> {
  return tauriInvoke<number>("cleanup_all_temp_documents");
}

/** Delete an encrypted document permanently. */
export async function deleteDocument(
  documentId: string,
  secureDeleteEnabled: boolean = true
): Promise<void> {
  return tauriInvoke<void>("delete_document", {
    documentId,
    secureDeleteEnabled,
  });
}

/** List all document metadata entries. */
export async function getAllDocuments(): Promise<SecureDocument[]> {
  return tauriInvoke<SecureDocument[]>("get_all_documents");
}

/** Get a single document's metadata. */
export async function getDocumentInfo(
  documentId: string
): Promise<SecureDocument> {
  return tauriInvoke<SecureDocument>("get_document_info", { documentId });
}

/** Secure-wipe a document from disk (convenience alias). */
export async function secureDeleteDocument(
  documentId: string
): Promise<void> {
  return tauriInvoke<void>("secure_delete_document", { documentId });
}
