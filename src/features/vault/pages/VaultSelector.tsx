// src/features/vault/pages/VaultSelector.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  listVaults,
  createVault,
  deleteVault,
  renameVault,
  selectVault,
} from "../services/multiVaultService";
import type { VaultMeta } from "../services/multiVaultService";
import styles from "./VaultSelector.module.css";

// ── SVG icons (inline to avoid external deps) ──────────────────────────────────

const LockIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="26"
    height="26"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const VaultIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="6" width="20" height="14" rx="2" />
    <path d="M12 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
    <circle cx="12" cy="14" r="2" />
    <path d="M12 16v2" />
  </svg>
);

const PlusIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const PenIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);

const TrashIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

// ── Props ──────────────────────────────────────────────────────────────────────

interface VaultSelectorProps {
  /** Called when a vault is selected — navigate to login with this vault ID + name. */
  onVaultSelected: (vaultId: string, vaultName: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

const VaultSelector: React.FC<VaultSelectorProps> = ({ onVaultSelected }) => {
  const [vaults, setVaults] = useState<VaultMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirm, setNewConfirm] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Load vaults ───────────────────────────────────────────────────────────
  const refreshVaults = useCallback(async () => {
    try {
      const list = await listVaults();
      setVaults(list);
      // If no vaults at all, show create form immediately
      if (list.length === 0) {
        setShowCreate(true);
      }
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to load vaults.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshVaults();
  }, [refreshVaults]);

  // ── Select vault ──────────────────────────────────────────────────────────
  const handleSelect = async (vaultId: string) => {
    try {
      await selectVault(vaultId);
      const vault = vaults.find((v) => v.id === vaultId);
      onVaultSelected(vaultId, vault?.name ?? "");
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to select vault.");
    }
  };

  // ── Create vault ──────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");

    if (newName.trim().length === 0) {
      setCreateError("Vault name is required.");
      return;
    }
    if (newPassword.length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== newConfirm) {
      setCreateError("Passwords do not match.");
      return;
    }

    setCreating(true);
    try {
      await createVault(newName.trim(), newPassword);
      setNewName("");
      setNewPassword("");
      setNewConfirm("");
      setShowCreate(false);
      await refreshVaults();
    } catch (e) {
      setCreateError(typeof e === "string" ? e : "Failed to create vault.");
    } finally {
      setCreating(false);
    }
  };

  // ── Rename vault ──────────────────────────────────────────────────────────
  const startRename = (vault: VaultMeta) => {
    setRenamingId(vault.id);
    setRenameValue(vault.name);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const commitRename = async () => {
    if (!renamingId || renameValue.trim().length === 0) {
      setRenamingId(null);
      return;
    }
    try {
      await renameVault(renamingId, renameValue.trim());
      setRenamingId(null);
      await refreshVaults();
    } catch (e) {
      setError(typeof e === "string" ? e : "Rename failed.");
      setRenamingId(null);
    }
  };

  // ── Delete vault ──────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteVault(deletingId);
      setDeletingId(null);
      await refreshVaults();
    } catch (e) {
      setError(typeof e === "string" ? e : "Delete failed.");
      setDeletingId(null);
    }
  };

  // ── Format date ───────────────────────────────────────────────────────────
  const fmtDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={`${styles.card} glass`}>
          <p className={styles.loadingText}>Loading vaults...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.card} glass`}>
        {/* Brand */}
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <LockIcon />
          </div>
          <h1 className={styles.title}>Smart Vault</h1>
          <p className={styles.subtitle}>
            {vaults.length === 0
              ? "Create your first vault to get started"
              : "Choose a vault to unlock"}
          </p>
        </div>

        {/* Error */}
        {error && <p className={styles.errorText}>{error}</p>}

        {/* Search bar – only when 2+ vaults */}
        {vaults.length > 1 && (
          <div className={styles.searchWrapper}>
            <svg
              className={styles.searchIcon}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search vaults…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Vault list */}
        {vaults.length > 0 && (() => {
          const filtered = vaults.filter((v) =>
            v.name.toLowerCase().includes(searchQuery.toLowerCase())
          );
          return filtered.length > 0 ? (
          <div className={styles.vaultList}>
            {filtered.map((v) => (
              <div
                key={v.id}
                className={styles.vaultItem}
                onClick={() =>
                  renamingId !== v.id && handleSelect(v.id)
                }
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renamingId !== v.id) handleSelect(v.id);
                }}
              >
                <div className={styles.vaultIcon}>
                  <VaultIcon />
                </div>
                <div className={styles.vaultInfo}>
                  {renamingId === v.id ? (
                    <input
                      ref={renameInputRef}
                      className={styles.renameInput}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <p className={styles.vaultName}>{v.name}</p>
                      <p className={styles.vaultDate}>
                        Created {fmtDate(v.created_at)}
                      </p>
                    </>
                  )}
                </div>
                <div className={styles.vaultActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(v);
                    }}
                  >
                    <PenIcon />
                  </button>
                  {vaults.length > 1 && (
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(v.id);
                      }}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          ) : (
            <p className={styles.emptyState}>No vaults match "{searchQuery}"</p>
          );
        })()}

        {/* Empty state */}
        {vaults.length === 0 && !showCreate && (
          <p className={styles.emptyState}>No vaults found.</p>
        )}

        {/* Create section */}
        <div className={styles.createSection}>
          {!showCreate ? (
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon /> Create New Vault
            </button>
          ) : (
            <form className={styles.createForm} onSubmit={handleCreate}>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Vault Name</label>
                <input
                  className={styles.input}
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setCreateError("");
                  }}
                  placeholder="e.g. Personal, Work"
                  autoFocus
                  disabled={creating}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Master Password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setCreateError("");
                  }}
                  placeholder="At least 8 characters"
                  disabled={creating}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Confirm Password</label>
                <input
                  className={`${styles.input} ${
                    newConfirm && newConfirm !== newPassword
                      ? styles.inputError
                      : ""
                  }`}
                  type="password"
                  value={newConfirm}
                  onChange={(e) => {
                    setNewConfirm(e.target.value);
                    setCreateError("");
                  }}
                  placeholder="Re-enter password"
                  disabled={creating}
                />
              </div>
              {createError && (
                <p className={styles.errorText}>{createError}</p>
              )}
              <div className={styles.formActions}>
                {vaults.length > 0 && (
                  <button
                    type="button"
                    className={styles.formBtn}
                    onClick={() => {
                      setShowCreate(false);
                      setCreateError("");
                      setNewName("");
                      setNewPassword("");
                      setNewConfirm("");
                    }}
                    disabled={creating}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className={`${styles.formBtn} ${styles.formBtnPrimary}`}
                  disabled={
                    creating ||
                    newName.trim().length === 0 ||
                    newPassword.length < 8 ||
                    newPassword !== newConfirm
                  }
                >
                  {creating ? "Creating..." : "Create Vault"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deletingId && (
        <div
          className={styles.confirmOverlay}
          onClick={() => setDeletingId(null)}
        >
          <div
            className={styles.confirmCard}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.confirmTitle}>Delete Vault</h3>
            <p className={styles.confirmText}>
              Are you sure you want to permanently delete{" "}
              <strong>
                {vaults.find((v) => v.id === deletingId)?.name ?? "this vault"}
              </strong>
              ? All passwords and documents stored in it will be lost. This
              action cannot be undone.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.formBtn}
                onClick={() => setDeletingId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmBtnDanger}
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultSelector;
