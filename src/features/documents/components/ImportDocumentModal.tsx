// src/features/documents/components/ImportDocumentModal.tsx
import React, { useCallback, useState } from "react";
import { importDocument } from "../services/documentService";
import { formatFileSize } from "../types/document.types";
import styles from "./ImportDocumentModal.module.css";

interface ImportDocumentModalProps {
  onClose: () => void;
  onImported: () => void;
  chunkSizeMb?: number;
}

const ImportDocumentModal: React.FC<ImportDocumentModalProps> = ({
  onClose,
  onImported,
  chunkSizeMb = 4,
}) => {
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    name: string;
    size: number;
    ext: string;
  } | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── File picker via Tauri dialog ───────────────────────────────────────

  const handlePickFile = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        title: "Select a document to encrypt",
        multiple: false,
        directory: false,
      });
      if (typeof result !== "string" || !result) return;

      // Extract filename and extension from path
      const segments = result.replace(/\\/g, "/").split("/");
      const fileName = segments[segments.length - 1] || "document";
      const dotIdx = fileName.lastIndexOf(".");
      const ext = dotIdx >= 0 ? fileName.slice(dotIdx) : "";
      const nameWithoutExt =
        dotIdx >= 0 ? fileName.slice(0, dotIdx) : fileName;

      setSelectedFile({
        path: result,
        name: fileName,
        size: 0, // We don't have file size from the dialog; Rust handles validation
        ext,
      });

      // Default the document name to filename without extension
      if (!documentName) {
        setDocumentName(nameWithoutExt);
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [documentName]);

  // ── Import ─────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!selectedFile) return;
    const name = documentName.trim() || selectedFile.name;

    setImporting(true);
    setError(null);

    try {
      await importDocument(selectedFile.path, name, hasPassword, chunkSizeMb);
      onImported();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }, [selectedFile, documentName, hasPassword, chunkSizeMb, onImported]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Import Document</h3>

        {/* File selection */}
        {!selectedFile ? (
          <button
            type="button"
            className={styles.dropZone}
            onClick={handlePickFile}
          >
            <svg
              className={styles.dropIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className={styles.dropText}>Click to select a file</span>
            <span className={styles.dropHint}>
              Supports any file type · Max 2 GB
            </span>
          </button>
        ) : (
          <div className={styles.filePreview}>
            <div className={styles.filePreviewIcon}>
              {selectedFile.ext.replace(/^\./, "").toUpperCase().slice(0, 4) ||
                "FILE"}
            </div>
            <div className={styles.filePreviewInfo}>
              <div className={styles.filePreviewName}>{selectedFile.name}</div>
              {selectedFile.size > 0 && (
                <div className={styles.filePreviewSize}>
                  {formatFileSize(selectedFile.size)}
                </div>
              )}
            </div>
            <button
              type="button"
              className={styles.fileRemoveBtn}
              onClick={() => {
                setSelectedFile(null);
                setDocumentName("");
              }}
              aria-label="Remove selected file"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Document name */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="doc-name">
            Document name
          </label>
          <input
            id="doc-name"
            type="text"
            className={styles.input}
            placeholder="Enter a display name…"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
          />
        </div>

        {/* Password-protected checkbox */}
        <div className={styles.checkRow}>
          <input
            id="doc-has-pw"
            type="checkbox"
            checked={hasPassword}
            onChange={(e) => setHasPassword(e.target.checked)}
          />
          <label
            htmlFor="doc-has-pw"
            className={styles.checkLabel}
          >
            Document is password-protected (e.g. encrypted PDF)
          </label>
        </div>

        {/* Error */}
        {error && <div className={styles.error}>{error}</div>}

        {/* Importing indicator */}
        {importing && (
          <div className={styles.progress}>Encrypting and storing…</div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={importing}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.submitBtn}
            disabled={!selectedFile || importing}
            onClick={handleImport}
          >
            {importing ? "Importing…" : "Import & Encrypt"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportDocumentModal;
