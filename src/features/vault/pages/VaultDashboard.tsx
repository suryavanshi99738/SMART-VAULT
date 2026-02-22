import React, { useCallback, useEffect, useState } from "react";
import { useVault } from "../hooks/useVault";
import type { VaultEntry, VaultEntryPayload } from "../types/vault.types";
import SearchBar from "../components/SearchBar";
import PasswordList from "../components/PasswordList";
import AddEditModal from "../components/AddEditModal";
import styles from "./VaultDashboard.module.css";

const VaultDashboard: React.FC = () => {
  const { state, fetchEntries, addEntry, updateEntry, removeEntry } =
    useVault();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VaultEntry | null>(null);

  // Fetch once on mount
  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Modal handlers ───────────────────────────────────── */

  const openAdd = useCallback(() => {
    setEditing(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((entry: VaultEntry) => {
    setEditing(entry);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditing(null);
  }, []);

  const handleSave = useCallback(
    async (payload: VaultEntryPayload, id?: string) => {
      if (id) {
        await updateEntry(id, payload);
      } else {
        await addEntry(payload);
      }
    },
    [addEntry, updateEntry]
  );

  /* ── Delete confirmation ──────────────────────────────── */

  const openDeleteById = useCallback(
    (id: string) => {
      const entry = state.entries.find((e) => e.id === id) ?? null;
      setDeleteTarget(entry);
    },
    [state.entries]
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await removeEntry(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, removeEntry]);

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <h2 className={styles.heading}>Password Vault</h2>
        <button type="button" className={styles.addBtn} onClick={openAdd}>
          <span className={styles.addIcon}>+</span>
          Add Entry
        </button>
      </div>

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} />

      {/* Error */}
      {state.error && <p className={styles.error}>{state.error}</p>}

      {/* Loading */}
      {state.loading && state.entries.length === 0 && (
        <p className={styles.loading}>Loading entries…</p>
      )}

      {/* List */}
      <PasswordList
        entries={state.entries}
        search={search}
        onEdit={openEdit}
        onDelete={openDeleteById}
      />

      {/* Add / Edit modal */}
      {modalOpen && (
        <AddEditModal
          editingEntry={editing}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className={styles.confirmBackdrop} onClick={cancelDelete}>
          <div
            className={styles.confirmDialog}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm deletion"
          >
            <h3 className={styles.confirmTitle}>Delete Entry</h3>
            <p className={styles.confirmText}>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.service_name}</strong>? This action cannot be
              undone.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={cancelDelete}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDelete}
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

export default VaultDashboard;
