// src/features/documents/pages/DocumentsPage.tsx
import React, { useCallback, useEffect, useState } from "react";
import type { SecureDocument } from "../types/document.types";
import { formatFileSize, getFileCategory } from "../types/document.types";
import {
  getAllDocuments,
  openDocument,
  cleanupTempDocument,
  deleteDocument,
} from "../services/documentService";
import ImportDocumentModal from "../components/ImportDocumentModal";
import styles from "./DocumentsPage.module.css";

// ── File-type icon badge labels ─────────────────────────────────────────────

function iconLabel(ext: string): string {
  const clean = ext.replace(/^\./, "").toUpperCase();
  return clean.length > 4 ? clean.slice(0, 4) : clean || "FILE";
}

// ── Sort options ────────────────────────────────────────────────────────────

type SortKey = "newest" | "oldest" | "name" | "size";

function sortDocuments(docs: SecureDocument[], key: SortKey): SecureDocument[] {
  const sorted = [...docs];
  switch (key) {
    case "newest":
      return sorted.sort((a, b) => b.created_at - a.created_at);
    case "oldest":
      return sorted.sort((a, b) => a.created_at - b.created_at);
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "size":
      return sorted.sort((a, b) => b.size - a.size);
    default:
      return sorted;
  }
}

// ── Props ───────────────────────────────────────────────────────────────────

interface DocumentsPageProps {
  secureDeleteEnabled?: boolean;
  chunkSizeMb?: number;
}

// ── Component ───────────────────────────────────────────────────────────────

const DocumentsPage: React.FC<DocumentsPageProps> = ({
  secureDeleteEnabled = true,
  chunkSizeMb = 4,
}) => {
  const [documents, setDocuments] = useState<SecureDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [showImport, setShowImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SecureDocument | null>(
    null
  );
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Fetch documents ────────────────────────────────────────────────────

  const fetchDocuments = useCallback(async () => {
    try {
      setError(null);
      const docs = await getAllDocuments();
      setDocuments(docs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // ── Open document ──────────────────────────────────────────────────────

  const handleOpen = useCallback(async (doc: SecureDocument) => {
    setActionLoading(doc.id);
    try {
      const tempPath = await openDocument(doc.id);
      // Use Tauri's opener to open with default OS application
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(tempPath);
      // Schedule cleanup after a reasonable delay (user may still be viewing)
      setTimeout(async () => {
        try {
          await cleanupTempDocument(tempPath);
        } catch {
          /* best-effort cleanup */
        }
      }, 60_000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(null);
    }
  }, []);

  // ── Delete document ────────────────────────────────────────────────────

  const handleDeleteConfirm = useCallback(async () => {
    if (!confirmDelete) return;
    setActionLoading(confirmDelete.id);
    try {
      await deleteDocument(confirmDelete.id, secureDeleteEnabled);
      setDocuments((prev) => prev.filter((d) => d.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(null);
    }
  }, [confirmDelete, secureDeleteEnabled]);

  // ── Import callback ────────────────────────────────────────────────────

  const handleImported = useCallback(() => {
    setShowImport(false);
    fetchDocuments();
  }, [fetchDocuments]);

  // ── Filtered + sorted list ─────────────────────────────────────────────

  const filtered = documents.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.original_extension.toLowerCase().includes(search.toLowerCase())
  );
  const sorted = sortDocuments(filtered, sortKey);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Secure Documents</h2>
      <p className={styles.subtitle}>
        Encrypted document storage with AES-256-GCM.
      </p>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.sortSelect}
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
          <option value="size">Largest first</option>
        </select>
        <button
          type="button"
          className={styles.importBtn}
          onClick={() => setShowImport(true)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Import
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className={styles.loading}>Loading documents…</div>
      ) : sorted.length === 0 ? (
        <div className={styles.empty}>
          <svg
            className={styles.emptyIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <span className={styles.emptyText}>
            {search
              ? "No documents match your search."
              : "No documents stored yet. Import a file to get started."}
          </span>
          {!search && (
            <button
              type="button"
              className={styles.emptyBtn}
              onClick={() => setShowImport(true)}
            >
              Import your first document
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {sorted.map((doc) => {
            const category = getFileCategory(doc.original_extension);
            const isLoading = actionLoading === doc.id;
            return (
              <div key={doc.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div
                    className={styles.fileIcon}
                    data-category={category}
                  >
                    {iconLabel(doc.original_extension)}
                  </div>
                  <div className={styles.cardInfo}>
                    <p className={styles.cardName} title={doc.name}>
                      {doc.name}
                    </p>
                    <p className={styles.cardMeta}>
                      <span>{formatFileSize(doc.size)}</span>
                      <span>·</span>
                      <span>
                        {new Date(doc.created_at * 1000).toLocaleDateString()}
                      </span>
                      {doc.has_password && (
                        <span
                          className={styles.lockBadge}
                          title="Password-protected"
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect
                              x="3"
                              y="11"
                              width="18"
                              height="11"
                              rx="2"
                            />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.cardBtn}
                    disabled={isLoading}
                    onClick={() => handleOpen(doc)}
                  >
                    {isLoading ? "…" : "Open"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.cardBtn} ${styles.cardBtnDanger}`}
                    disabled={isLoading}
                    onClick={() => setConfirmDelete(doc)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <ImportDocumentModal
          onClose={() => setShowImport(false)}
          onImported={handleImported}
          chunkSizeMb={chunkSizeMb}
        />
      )}

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div
          className={styles.confirmOverlay}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className={styles.confirmBox}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.confirmTitle}>Delete document?</h3>
            <p className={styles.confirmText}>
              &ldquo;{confirmDelete.name}&rdquo; will be{" "}
              {secureDeleteEnabled
                ? "securely wiped (multi-pass overwrite)"
                : "permanently deleted"}
              . This cannot be undone.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDelete}
                disabled={actionLoading === confirmDelete.id}
                onClick={handleDeleteConfirm}
              >
                {actionLoading === confirmDelete.id
                  ? "Deleting…"
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;
