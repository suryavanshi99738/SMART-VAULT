import React, { useState } from "react";
import type { VaultEntry } from "../types/vault.types";
import { decryptEntryPassword } from "../services/vaultService";
import { scheduleClipboardClear } from "../../clipboard/clipboardService";
import styles from "./PasswordItem.module.css";

interface PasswordItemProps {
  entry: VaultEntry;
  onEdit: (entry: VaultEntry) => void;
  onDelete: (id: string) => void;
}

const PasswordItem: React.FC<PasswordItemProps> = ({
  entry,
  onEdit,
  onDelete,
}) => {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [decryptedPw, setDecryptedPw] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [loadingPw, setLoadingPw] = useState(false);

  const handleCopy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const password = await decryptEntryPassword(entry.id);
      await navigator.clipboard.writeText(password);
      setCopied(true);
      scheduleClipboardClear();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail – could surface toast later
    } finally {
      setCopying(false);
    }
  };

  const toggleExpand = () => {
    setExpanded((prev) => {
      if (prev) {
        // Collapsing — reset password state
        setDecryptedPw(null);
        setShowPw(false);
      }
      return !prev;
    });
  };

  const handleRevealPassword = async () => {
    if (showPw) {
      setShowPw(false);
      return;
    }
    if (decryptedPw) {
      setShowPw(true);
      return;
    }
    setLoadingPw(true);
    try {
      const pw = await decryptEntryPassword(entry.id);
      setDecryptedPw(pw);
      setShowPw(true);
    } catch {
      // Could surface an error toast
    } finally {
      setLoadingPw(false);
    }
  };

  const handleCopyField = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // silent
    }
  };

  const initial = entry.service_name.charAt(0).toUpperCase();

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className={`${styles.card} ${expanded ? styles.cardExpanded : ""}`}>
      {/* Main row */}
      <div className={styles.mainRow}>
        <div
          className={styles.avatar}
          aria-hidden="true"
          onClick={toggleExpand}
          role="button"
          tabIndex={0}
          title="Show details"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggleExpand();
          }}
        >
          {initial}
        </div>

        <div
          className={styles.info}
          onClick={toggleExpand}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggleExpand();
          }}
        >
          <span className={styles.service}>{entry.service_name}</span>
          <span className={styles.username}>{entry.username}</span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${copied ? styles.btnSuccess : ""}`}
            onClick={handleCopy}
            disabled={copying}
            aria-label="Copy password"
            title="Copy password"
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            )}
          </button>

          <button
            type="button"
            className={styles.btn}
            onClick={() => onEdit(entry)}
            aria-label="Edit entry"
            title="Edit"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </button>

          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={() => onDelete(entry.id)}
            aria-label="Delete entry"
            title="Delete"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        </div>
      </div>

      {/* Expandable detail panel */}
      {expanded && (
        <div className={styles.details}>
          <div className={styles.detailGrid}>
            {/* Service */}
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Service</span>
              <div className={styles.detailValueRow}>
                <span className={styles.detailValue}>{entry.service_name}</span>
              </div>
            </div>

            {/* Username */}
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Username</span>
              <div className={styles.detailValueRow}>
                <span className={styles.detailValue}>{entry.username}</span>
                <button
                  type="button"
                  className={styles.detailCopyBtn}
                  onClick={() => handleCopyField(entry.username)}
                  title="Copy username"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                </button>
              </div>
            </div>

            {/* Email */}
            {entry.email && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Email</span>
                <div className={styles.detailValueRow}>
                  <span className={styles.detailValue}>{entry.email}</span>
                  <button
                    type="button"
                    className={styles.detailCopyBtn}
                    onClick={() => handleCopyField(entry.email)}
                    title="Copy email"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  </button>
                </div>
              </div>
            )}

            {/* Category */}
            {entry.category && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Category</span>
                <div className={styles.detailValueRow}>
                  <span className={styles.detailValue}>{entry.category}</span>
                </div>
              </div>
            )}

            {/* Password */}
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Password</span>
              <div className={styles.detailValueRow}>
                <span className={styles.detailValue}>
                  {loadingPw
                    ? "Decrypting…"
                    : showPw && decryptedPw
                      ? decryptedPw
                      : "••••••••••••"}
                </span>
                <button
                  type="button"
                  className={styles.detailCopyBtn}
                  onClick={handleRevealPassword}
                  title={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
                {showPw && decryptedPw && (
                  <button
                    type="button"
                    className={styles.detailCopyBtn}
                    onClick={() => handleCopyField(decryptedPw)}
                    title="Copy password"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  </button>
                )}
              </div>
            </div>

            {/* Notes */}
            {entry.notes && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Notes</span>
                <div className={styles.detailValueRow}>
                  <span className={styles.detailValue}>{entry.notes}</span>
                </div>
              </div>
            )}

            {/* Dates */}
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Created</span>
              <div className={styles.detailValueRow}>
                <span className={styles.detailValue}>
                  {formatDate(entry.created_at)}
                </span>
              </div>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Last Updated</span>
              <div className={styles.detailValueRow}>
                <span className={styles.detailValue}>
                  {formatDate(entry.updated_at)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PasswordItem;
