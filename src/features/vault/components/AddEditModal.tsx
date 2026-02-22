import React, { useEffect, useState } from "react";
import type { VaultEntry, VaultEntryPayload } from "../types/vault.types";
import PasswordGenerator from "./PasswordGenerator";
import styles from "./AddEditModal.module.css";

interface AddEditModalProps {
  editingEntry: VaultEntry | null;
  onSave: (payload: VaultEntryPayload, id?: string) => Promise<void>;
  onClose: () => void;
}

const AddEditModal: React.FC<AddEditModalProps> = ({
  editingEntry,
  onSave,
  onClose,
}) => {
  const isEdit = editingEntry !== null;

  const [serviceName, setServiceName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState("General");
  const [notes, setNotes] = useState("");
  const [showGenerator, setShowGenerator] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const categories = [
    "General",
    "Social",
    "Email",
    "Finance",
    "Work",
    "Shopping",
    "Entertainment",
    "Development",
    "Other",
  ];

  useEffect(() => {
    if (editingEntry) {
      setServiceName(editingEntry.service_name);
      setUsername(editingEntry.username);
      setEmail(editingEntry.email);
      setCategory(editingEntry.category || "General");
      setNotes(editingEntry.notes ?? "");
      setPassword(""); // never pre-fill password
    }
  }, [editingEntry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!serviceName.trim()) {
      setError("Service name is required.");
      return;
    }
    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    setSaving(true);
    try {
      const payload: VaultEntryPayload = {
        service_name: serviceName.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        category: category.trim() || "General",
        notes: notes.trim() || null,
      };
      await onSave(payload, editingEntry?.id);
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Failed to save entry.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit password entry" : "Add password entry"}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isEdit ? "Edit Entry" : "Add New Entry"}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {/* Service name */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="modal-service">
              Service Name
            </label>
            <input
              id="modal-service"
              className={styles.input}
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="e.g. GitHub, Google, Netflix"
              autoFocus
            />
          </div>

          {/* Username */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="modal-username">
              Username
            </label>
            <input
              id="modal-username"
              className={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. johndoe"
            />
          </div>

          {/* Email */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="modal-email">
              Email <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="modal-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>

          {/* Category */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="modal-category">
              Category
            </label>
            <select
              id="modal-category"
              className={styles.input}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Password */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="modal-password">
              Password
            </label>
            <div className={styles.passwordRow}>
              <input
                id="modal-password"
                className={styles.input}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? "Enter new password" : "Enter password"}
              />
              <button
                type="button"
                className={styles.toggleBtn}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <button
              type="button"
              className={styles.genToggle}
              onClick={() => setShowGenerator((v) => !v)}
            >
              {showGenerator ? "Hide generator" : "Generate password"}
            </button>
          </div>

          {showGenerator && (
            <PasswordGenerator onUse={(pw) => setPassword(pw)} />
          )}

          {/* Notes */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="modal-notes">
              Notes <span className={styles.optional}>(optional)</span>
            </label>
            <textarea
              id="modal-notes"
              className={styles.textarea}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes…"
              rows={3}
            />
          </div>

          {/* Error */}
          {error && <p className={styles.error}>{error}</p>}

          {/* Actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={saving}
            >
              {saving ? "Saving…" : isEdit ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEditModal;
