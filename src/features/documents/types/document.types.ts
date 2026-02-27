// src/features/documents/types/document.types.ts
// Mirrors the Rust SecureDocument struct in document_commands.rs

export interface SecureDocument {
  id: string;
  name: string;
  encrypted_file_name: string;
  original_extension: string;
  /** Original file size in bytes (before encryption) */
  size: number;
  /** Whether the document itself is password-protected (e.g. encrypted PDF) */
  has_password: boolean;
  created_at: number;
  updated_at: number;
}

/** File type categories for display icons */
export type FileCategory =
  | "pdf"
  | "image"
  | "document"
  | "spreadsheet"
  | "archive"
  | "code"
  | "text"
  | "other";

/** Map common extensions to file categories */
export function getFileCategory(extension: string): FileCategory {
  const ext = extension.toLowerCase().replace(/^\./, "");
  switch (ext) {
    case "pdf":
      return "pdf";
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "bmp":
    case "svg":
    case "webp":
    case "ico":
      return "image";
    case "doc":
    case "docx":
    case "odt":
    case "rtf":
      return "document";
    case "xls":
    case "xlsx":
    case "csv":
    case "ods":
      return "spreadsheet";
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
    case "bz2":
      return "archive";
    case "js":
    case "ts":
    case "py":
    case "rs":
    case "html":
    case "css":
    case "json":
    case "xml":
    case "yaml":
    case "yml":
    case "sql":
      return "code";
    case "txt":
    case "md":
    case "log":
      return "text";
    default:
      return "other";
  }
}

/** Format bytes to human-readable string */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
