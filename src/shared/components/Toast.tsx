// src/shared/components/Toast.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight toast notification component.
//
// Usage:
//   const { toasts, showToast } = useToast();
//   showToast({ title: "Vault locked", message: "Window minimized", type: "warning" });
//   <ToastContainer toasts={toasts} onDismiss={dismissToast} />
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Toast.module.css";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ToastType = "warning" | "info" | "error";

export interface Toast {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
  /** Auto-dismiss after this many ms (default 3500). */
  duration?: number;
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const WarningIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const LockIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── Single toast item ──────────────────────────────────────────────────────────

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const DURATION_DEFAULT = 3500;

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const [exiting, setExiting] = useState(false);
  const duration = toast.duration ?? DURATION_DEFAULT;

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 220);
  }, [toast.id, onDismiss]);

  // Auto-dismiss after duration
  useEffect(() => {
    const t = setTimeout(dismiss, duration);
    return () => clearTimeout(t);
  }, [dismiss, duration]);

  const IconComponent = toast.type === "warning" ? LockIcon : WarningIcon;

  return (
    <div
      className={styles.toast}
      role="alert"
      aria-live="assertive"
      data-exiting={exiting ? "true" : undefined}
      style={{ position: "relative", overflow: "hidden" }}
    >
      <div className={styles.icon} data-type={toast.type}>
        <IconComponent />
      </div>
      <div className={styles.body}>
        <div className={styles.title}>{toast.title}</div>
        {toast.message && (
          <div className={styles.message}>{toast.message}</div>
        )}
      </div>
      <button
        className={styles.close}
        onClick={dismiss}
        aria-label="Dismiss notification"
        type="button"
      >
        <CloseIcon />
      </button>
      <div
        className={styles.progressBar}
        style={{ "--toast-duration": `${duration}ms` } as React.CSSProperties}
      />
    </div>
  );
};

// ── Container ──────────────────────────────────────────────────────────────────

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;
  return (
    <div className={styles.container} aria-label="Notifications">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

let _nextId = 1;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(_nextId);

  const showToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = String(idRef.current++);
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}
