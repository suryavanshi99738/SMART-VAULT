// src/features/settings/components/ReportSection.tsx
import React, { useCallback, useState } from "react";
import { scheduleClipboardClear } from "../../clipboard/clipboardService";
import styles from "./ReportSection.module.css";

const DEVELOPER_EMAIL = "swarajsrwnsh@gmail.com";
const APP_VERSION = "0.1.0";

/** Detect OS name from user-agent (desktop Tauri app). */
function detectOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown";
}

interface ReportSectionProps {
  /** Clipboard auto-clear seconds from user settings. */
  clipboardClearSeconds?: number;
}

const ReportSection: React.FC<ReportSectionProps> = ({
  clipboardClearSeconds = 15,
}) => {
  const [copied, setCopied] = useState(false);

  // ── Copy email to clipboard ────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(DEVELOPER_EMAIL);
      scheduleClipboardClear(clipboardClearSeconds);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: the user can manually select the email text
    }
  }, [clipboardClearSeconds]);

  // ── Open mail app via mailto ───────────────────────────────────────────────
  const handleMailto = useCallback(async () => {
    const os = detectOS();
    const subject = encodeURIComponent("Smart Vault Feedback");
    const body = encodeURIComponent(
      `Smart Vault Version: ${APP_VERSION}\nOS: ${os}\n\nDescribe your issue or suggestion:\n\n`
    );
    const mailtoUrl = `mailto:${DEVELOPER_EMAIL}?subject=${subject}&body=${body}`;

    try {
      // Use Tauri opener plugin (already registered in lib.rs)
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(mailtoUrl);
    } catch {
      // Fallback for web / dev mode
      window.open(mailtoUrl, "_blank");
    }
  }, []);

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.iconWrapper}>
          {/* Shield-check icon */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
        </div>
        <div className={styles.headerText}>
          <h4 className={styles.title}>Contact Developer</h4>
          <p className={styles.description}>
            Smart Vault does not send any data over the internet. If you would
            like to report a bug or share a suggestion, please contact us
            directly.
          </p>
        </div>
      </div>

      {/* Email display row */}
      <div className={styles.emailRow}>
        <span className={styles.emailIcon}>
          {/* Mail icon */}
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
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </span>
        <span className={styles.emailAddress}>{DEVELOPER_EMAIL}</span>
      </div>

      {/* Action buttons */}
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.actionBtn} ${copied ? styles.actionBtnCopied : ""}`}
          onClick={handleCopy}
          aria-label="Copy developer email to clipboard"
        >
          {copied ? (
            <>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy Email
            </>
          )}
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={handleMailto}
          aria-label="Open email application"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          Open Mail App
        </button>
      </div>

      {/* Trust notice */}
      <div className={styles.notice}>
        <span className={styles.noticeIcon}>
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
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </span>
        <p className={styles.noticeText}>
          Smart Vault does not collect analytics, telemetry, or usage data. All
          feedback is user-initiated and sent manually through your email client.
        </p>
      </div>
    </div>
  );
};

export default ReportSection;
