// src/features/settings/components/CsvImportModal.tsx

import { useState, useCallback, useRef, type DragEvent } from "react";
import {
  parseCsvPreview,
  importCsvEntries,
  type CsvPreviewEntry,
} from "../backupService";
import styles from "./CsvImportModal.module.css";

interface CsvImportModalProps {
  onClose: () => void;
  onSuccess?: (count: number) => void;
}

type Stage = "pick" | "preview" | "importing" | "done";

export default function CsvImportModal({
  onClose,
  onSuccess,
}: CsvImportModalProps) {
  const [stage, setStage] = useState<Stage>("pick");
  const [filePath, setFilePath] = useState("");
  const [entries, setEntries] = useState<CsvPreviewEntry[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── file pick via dialog ─────────────────────────────── */
  const openFilePicker = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        title: "Select CSV File",
        filters: [{ name: "CSV", extensions: ["csv"] }],
        multiple: false,
        directory: false,
      });
      if (typeof result === "string" && result) {
        await loadPreview(result);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  /* ── parse & preview ──────────────────────────────────── */
  const loadPreview = async (path: string) => {
    setError("");
    setFilePath(path);
    try {
      const preview = await parseCsvPreview(path);
      if (preview.length === 0) {
        setError("No importable entries found in this CSV.");
        return;
      }
      setEntries(preview);
      setSelected(new Set(preview.map((e) => e.index)));
      setStage("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  /* ── drag & drop handlers ─────────────────────────────── */
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are supported.");
      return;
    }
    // For Tauri drag-and-drop we get the path through the File object
    // but we need to use the native dialog fallback since web drag-drop
    // doesn't give us a real filesystem path. Prompt user.
    setError("Please use the file picker button to select your CSV file.");
  };

  /* ── selection helpers ────────────────────────────────── */
  const toggleEntry = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.index)));
    }
  };

  /* ── import ───────────────────────────────────────────── */
  const handleImport = async () => {
    if (selected.size === 0) return;
    setStage("importing");
    setError("");
    try {
      const count = await importCsvEntries(
        filePath,
        Array.from(selected)
      );
      setImportedCount(count);
      setStage("done");
      onSuccess?.(count);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("preview");
    }
  };

  /* ── backdrop click = close ───────────────────────────── */
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  /* ── hidden file input (fallback) ─────────────────────── */
  const onFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    // Not usable in Tauri (no real path), kept as visual fallback
    const file = e.target.files?.[0];
    if (file) {
      setError("Please use the file picker button to select your CSV file.");
    }
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal}>
        {/* header */}
        <div className={styles.header}>
          <h3 className={styles.title}>
            {stage === "done" ? "Import Complete" : "Import from CSV"}
          </h3>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* error */}
        {error && <div className={styles.error}>{error}</div>}

        {/* stage: pick */}
        {stage === "pick" && (
          <>
            <div
              className={`${styles.dropZone} ${
                dragging ? styles.dropZoneDragging : ""
              }`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <svg
                className={styles.dropZoneIcon}
                width={36}
                height={36}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path d="M12 16V4m0 0L8 8m4-4l4 4" />
                <path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" />
              </svg>
              <p className={styles.dropZoneText}>
                Drag & drop a CSV file here, or{" "}
                <span className={styles.dropZoneLink} onClick={openFilePicker}>
                  browse
                </span>
              </p>
            </div>

            <div className={styles.formatInfo}>
              <strong>Supported formats:</strong> Chrome, Edge, Bitwarden CSV
              exports.
              <br />
              Expected columns:{" "}
              <code>name/url</code>, <code>username</code>,{" "}
              <code>password</code>. Other columns are auto-detected.
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={onFileInputChange}
            />

            <div className={styles.footer}>
              <span />
              <div className={styles.actions}>
                <button className={styles.btnCancel} onClick={onClose}>
                  Cancel
                </button>
                <button className={styles.btnImport} onClick={openFilePicker}>
                  Select File
                </button>
              </div>
            </div>
          </>
        )}

        {/* stage: preview */}
        {stage === "preview" && (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selected.size === entries.length}
                        onChange={toggleAll}
                      />
                    </th>
                    <th>Service</th>
                    <th>Username / Email</th>
                    <th>Password</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.index}>
                      <td>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={selected.has(entry.index)}
                          onChange={() => toggleEntry(entry.index)}
                        />
                      </td>
                      <td>{entry.service_name || "—"}</td>
                      <td>
                        {entry.username || entry.email || "—"}
                      </td>
                      <td>{entry.password_preview}</td>
                      <td>{entry.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.footer}>
              <span className={styles.selectedCount}>
                {selected.size} of {entries.length} selected
              </span>
              <div className={styles.actions}>
                <button
                  className={styles.btnCancel}
                  onClick={() => {
                    setStage("pick");
                    setEntries([]);
                    setSelected(new Set());
                    setFilePath("");
                    setError("");
                  }}
                >
                  Back
                </button>
                <button
                  className={styles.btnImport}
                  disabled={selected.size === 0}
                  onClick={handleImport}
                >
                  Import {selected.size} {selected.size === 1 ? "Entry" : "Entries"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* stage: importing */}
        {stage === "importing" && (
          <div style={{ padding: "32px 20px", textAlign: "center" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Importing {selected.size} entries…
            </p>
          </div>
        )}

        {/* stage: done */}
        {stage === "done" && (
          <>
            <div className={styles.success}>
              Successfully imported {importedCount}{" "}
              {importedCount === 1 ? "entry" : "entries"} into your vault.
            </div>
            <div className={styles.footer}>
              <span />
              <button className={styles.btnImport} onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
