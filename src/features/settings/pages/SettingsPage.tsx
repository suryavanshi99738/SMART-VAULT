// src/features/settings/pages/SettingsPage.tsx
import React, { useCallback, useEffect, useState } from "react";
import { useTheme } from "../../../app/context/ThemeContext";
import type { ThemeMode } from "../../../app/context/ThemeContext";
import type { AppSettings } from "../types/settings.types";
import { exportVault, importVault } from "../backupService";
import {
  exportVaultBackup,
  importVaultBackup,
} from "../../vault/services/multiVaultService";
import {
  registerGlobalShortcut,
  unregisterGlobalShortcut,
} from "../shortcutService";
import CsvImportModal from "../components/CsvImportModal";
import ReportSection from "../components/ReportSection";
import styles from "./SettingsPage.module.css";

const themeOptions: { value: ThemeMode; label: string; desc: string }[] = [
  { value: "light", label: "Light", desc: "Always use the light theme" },
  { value: "dark", label: "Dark", desc: "Always use the dark theme" },
  { value: "system", label: "System Default", desc: "Follow your OS setting" },
];

const autoLockOptions = [
  { value: 1, label: "1 minute" },
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
];

const clipboardClearOptions = [
  { value: 10, label: "10 seconds" },
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "60 seconds" },
  { value: 120, label: "2 minutes" },
];

const DEFAULT_SHORTCUT = "Ctrl+Alt+V";

// ── Props ──────────────────────────────────────────────────────────────────────

interface SettingsPageProps {
  settings: AppSettings;
  onSettingsChange: (updated: AppSettings) => void;
  masterPassword?: string;
  activeVaultId?: string | null;
  activeVaultName?: string;
  onSwitchVault?: () => void;
}

// ── Toggle switch ──────────────────────────────────────────────────────────────

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}

const Toggle: React.FC<ToggleProps> = ({
  id,
  checked,
  onChange,
  disabled,
  ariaLabel,
}) => (
  <button
    id={id}
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    type="button"
    disabled={disabled}
    className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}
    onClick={() => onChange(!checked)}
  >
    <span className={styles.toggleThumb} />
  </button>
);

// ── Component ──────────────────────────────────────────────────────────────────

const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onSettingsChange,
  masterPassword,
  activeVaultId,
  activeVaultName,
  onSwitchVault,
}) => {
  const { mode, setMode } = useTheme();
  const [local, setLocal] = useState<AppSettings>(settings);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const [shortcutInput, setShortcutInput] = useState(settings.global_shortcut);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  useEffect(() => {
    setLocal(settings);
    setShortcutInput(settings.global_shortcut);
  }, [settings]);

  const update = useCallback(
    (patch: Partial<AppSettings>) => {
      const updated = { ...local, ...patch };
      setLocal(updated);
      onSettingsChange(updated);
    },
    [local, onSettingsChange]
  );

  // ── Backup export ──────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const filePath = await save({
        title: "Export Vault Backup",
        defaultPath: `smart-vault-backup.svault`,
        filters: [{ name: "Smart Vault Backup", extensions: ["svault"] }],
      });
      if (!filePath) return;

      // Prompt for master password if not provided
      const pw = masterPassword;
      if (!pw) {
        setBackupStatus({
          type: "error",
          msg: "Master password not available. Please re-authenticate.",
        });
        return;
      }
      const timestamp = await exportVault(pw, filePath);
      update({ last_backup_date: timestamp });
      setBackupStatus({
        type: "success",
        msg: `Backup exported successfully.`,
      });
    } catch (err: unknown) {
      setBackupStatus({
        type: "error",
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  }, [masterPassword, update]);

  // ── Backup import ──────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    try {
      const { open, ask } = await import("@tauri-apps/plugin-dialog");
      const filePath = await open({
        title: "Import Vault Backup",
        filters: [{ name: "Smart Vault Backup", extensions: ["svault"] }],
        multiple: false,
        directory: false,
      });
      if (typeof filePath !== "string" || !filePath) return;

      const confirmed = await ask(
        "Importing will REPLACE all current vault entries. This action cannot be undone. Continue?",
        { title: "Confirm Import", kind: "warning" }
      );
      if (!confirmed) return;

      const pw = masterPassword;
      if (!pw) {
        setBackupStatus({
          type: "error",
          msg: "Master password not available. Please re-authenticate.",
        });
        return;
      }
      const count = await importVault(pw, filePath);
      setBackupStatus({
        type: "success",
        msg: `Successfully restored ${count} ${count === 1 ? "entry" : "entries"}.`,
      });
    } catch (err: unknown) {
      setBackupStatus({
        type: "error",
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  }, [masterPassword]);

  // ── Backup v2 (.smartbackup) export ────────────────────────────────────────
  const handleExportV2 = useCallback(async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const filePath = await save({
        title: "Export Vault Backup (.smartbackup)",
        defaultPath: `smart-vault-backup.smartbackup`,
        filters: [{ name: "Smart Backup", extensions: ["smartbackup"] }],
      });
      if (!filePath) return;

      const timestamp = await exportVaultBackup(
        filePath,
        activeVaultName || "Smart Vault",
        masterPassword || undefined
      );
      update({ last_backup_date: timestamp });
      setBackupStatus({
        type: "success",
        msg: "Encrypted backup exported successfully.",
      });
    } catch (err: unknown) {
      setBackupStatus({
        type: "error",
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  }, [masterPassword, activeVaultName, update]);

  // ── Backup v2 (.smartbackup) import ────────────────────────────────────────
  const handleImportV2 = useCallback(async () => {
    try {
      const { open, ask } = await import("@tauri-apps/plugin-dialog");
      const filePath = await open({
        title: "Import Vault Backup (.smartbackup)",
        filters: [{ name: "Smart Backup", extensions: ["smartbackup"] }],
        multiple: false,
        directory: false,
      });
      if (typeof filePath !== "string" || !filePath) return;

      const confirmed = await ask(
        "Importing will REPLACE all current vault entries. This action cannot be undone. Continue?",
        { title: "Confirm Import", kind: "warning" }
      );
      if (!confirmed) return;

      const result = await importVaultBackup(
        filePath,
        masterPassword || undefined
      );
      setBackupStatus({
        type: "success",
        msg: `Restored ${result.imported} ${result.imported === 1 ? "entry" : "entries"} from "${result.vault_name}".`,
      });
    } catch (err: unknown) {
      setBackupStatus({
        type: "error",
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  }, [masterPassword]);

  // ── Global shortcut toggle ─────────────────────────────────────────────────
  const handleShortcutToggle = useCallback(
    async (enabled: boolean) => {
      try {
        if (enabled) {
          await registerGlobalShortcut(local.global_shortcut);
        } else {
          await unregisterGlobalShortcut();
        }
        update({ global_shortcut_enabled: enabled });
      } catch (err: unknown) {
        setBackupStatus({
          type: "error",
          msg: `Shortcut error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
    [local.global_shortcut, update]
  );

  // ── Shortcut keybinding commit (on blur or Enter) ─────────────────────────

  /** Normalize user-typed accelerator to Tauri format (e.g. "ctrl+alt+v" → "Ctrl+Alt+V") */
  const normalizeAccelerator = (raw: string): string => {
    return raw
      .split("+")
      .map((part) => {
        const p = part.trim().toLowerCase();
        if (p === "ctrl" || p === "control") return "Ctrl";
        if (p === "alt") return "Alt";
        if (p === "shift") return "Shift";
        if (p === "super" || p === "meta" || p === "win" || p === "cmd") return "Super";
        if (p === "cmdorctrl" || p === "commandorcontrol") return "CmdOrCtrl";
        // Function keys stay as-is (F1-F24)
        if (/^f\d{1,2}$/.test(p)) return p.toUpperCase();
        // Single letter → uppercase
        if (p.length === 1) return p.toUpperCase();
        // Named keys: capitalize first letter
        return p.charAt(0).toUpperCase() + p.slice(1);
      })
      .filter(Boolean)
      .join("+");
  };

  const commitShortcut = useCallback(
    async (accelerator: string) => {
      const normalized = normalizeAccelerator(accelerator);
      setShortcutError(null);

      // If empty or unchanged, revert to current saved value
      if (!normalized || normalized === local.global_shortcut) {
        setShortcutInput(local.global_shortcut);
        return;
      }

      // Always update the display to the normalized form
      setShortcutInput(normalized);

      // Try to register the new shortcut
      try {
        if (local.global_shortcut_enabled) {
          await registerGlobalShortcut(normalized);
        }
        // Registration succeeded (or feature disabled) — persist the new value.
        // App.tsx's useEffect will also call registerGlobalShortcut, which is
        // harmless since Rust unregisters-all before each registration.
        update({ global_shortcut: normalized });
      } catch {
        // Registration failed — likely a system-level conflict or invalid format
        setShortcutError(
          "Global hotkey already registered in system for another app/file"
        );
        setShortcutInput(local.global_shortcut);
      }
    },
    [local.global_shortcut_enabled, local.global_shortcut, update]
  );

  const handleShortcutKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur(); // blur triggers commitShortcut via onBlur
      }
    },
    []
  );

  const resetShortcut = useCallback(async () => {
    setShortcutInput(DEFAULT_SHORTCUT);
    setShortcutError(null);
    try {
      if (local.global_shortcut_enabled) {
        await registerGlobalShortcut(DEFAULT_SHORTCUT);
      }
      update({ global_shortcut: DEFAULT_SHORTCUT });
    } catch (err: unknown) {
      setBackupStatus({
        type: "error",
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  }, [local.global_shortcut_enabled, update]);

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Settings</h2>
      <p className={styles.subtitle}>Customize your Smart Vault experience.</p>

      {/* ── 🔐 Security ─────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Security</h3>
        <p className={styles.sectionDesc}>
          Configure auto-lock and clipboard clearing behavior.
        </p>

        {/* Auto-lock duration */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <span className={styles.settingLabel}>
              Auto-lock after inactivity
            </span>
            <span className={styles.settingHint}>
              Vault automatically locks after this period of inactivity.
            </span>
          </div>
          <select
            className={styles.settingSelect}
            value={local.auto_lock_minutes}
            onChange={(e) =>
              update({ auto_lock_minutes: Number(e.target.value) })
            }
          >
            {autoLockOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Lock on focus loss */}
        <div className={styles.settingRow}>
          <label className={styles.settingInfo} htmlFor="toggle-lock-hide">
            <span className={styles.settingLabel}>
              Lock when window loses focus
            </span>
            <span className={styles.settingHint}>
              Vault locks when you switch to another application.
            </span>
          </label>
          <Toggle
            id="toggle-lock-hide"
            checked={local.lock_on_hide}
            onChange={(val) => update({ lock_on_hide: val })}
            ariaLabel="Lock vault when app loses focus"
          />
        </div>

        {/* Clipboard clear timer */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <span className={styles.settingLabel}>Clear clipboard after</span>
            <span className={styles.settingHint}>
              Sensitive data is removed from clipboard after this duration.
            </span>
          </div>
          <select
            className={styles.settingSelect}
            value={local.clipboard_clear_seconds}
            onChange={(e) =>
              update({ clipboard_clear_seconds: Number(e.target.value) })
            }
          >
            {clipboardClearOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Brute-force protection indicator */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <span className={styles.settingLabel}>Brute-force protection</span>
            <span className={styles.settingHint}>
              Argon2id key derivation with 64 MiB memory, 3 iterations.
              Always active.
            </span>
          </div>
          <span className={styles.statusBadge}>Active</span>
        </div>
      </section>

      {/* ── 🎨 Appearance ───────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Appearance</h3>
        <p className={styles.sectionDesc}>
          Choose how Smart Vault looks to you.
        </p>

        <div className={styles.themeCards}>
          {themeOptions.map((opt) => {
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`${styles.themeCard} ${
                  active ? styles.themeCardActive : ""
                }`}
                onClick={() => setMode(opt.value)}
                aria-pressed={active}
              >
                <div className={styles.themePreview} data-preview={opt.value}>
                  <div className={styles.previewSidebar} />
                  <div className={styles.previewMain}>
                    <div className={styles.previewHeader} />
                    <div className={styles.previewContent}>
                      <div className={styles.previewLine} />
                      <div className={styles.previewLineShort} />
                    </div>
                  </div>
                </div>
                <span className={styles.themeLabel}>{opt.label}</span>
                <span className={styles.themeDesc}>{opt.desc}</span>
                {active && (
                  <span className={styles.checkBadge} aria-label="Selected">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Compact mode toggle */}
        <div className={styles.settingRow}>
          <label className={styles.settingInfo} htmlFor="toggle-compact">
            <span className={styles.settingLabel}>Compact mode</span>
            <span className={styles.settingHint}>
              Reduce spacing and fit more items on screen.
            </span>
          </label>
          <Toggle
            id="toggle-compact"
            checked={local.compact_mode}
            onChange={(val) => update({ compact_mode: val })}
            ariaLabel="Enable compact layout mode"
          />
        </div>

        {/* Enable animations toggle */}
        <div className={styles.settingRow}>
          <label className={styles.settingInfo} htmlFor="toggle-animations">
            <span className={styles.settingLabel}>Enable animations</span>
            <span className={styles.settingHint}>
              Enable smooth UI transitions and micro-interactions.
            </span>
          </label>
          <Toggle
            id="toggle-animations"
            checked={local.enable_animations}
            onChange={(val) => update({ enable_animations: val })}
            ariaLabel="Enable UI transition animations"
          />
        </div>
      </section>

      {/* ── ✦ Motion & Transitions ──────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Motion & Transitions</h3>
        <p className={styles.sectionDesc}>
          Fine-tune animation behavior for accessibility and performance.
        </p>

        {/* Reduced motion */}
        <div className={styles.settingRow}>
          <label className={styles.settingInfo} htmlFor="toggle-reduced-motion">
            <span className={styles.settingLabel}>Reduced motion mode</span>
            <span className={styles.settingHint}>
              Minimizes motion for accessibility. Replaces transitions with
              simple fades.
            </span>
          </label>
          <Toggle
            id="toggle-reduced-motion"
            checked={local.reduced_motion}
            onChange={(val) => update({ reduced_motion: val })}
            disabled={!local.enable_animations}
            ariaLabel="Enable reduced motion mode"
          />
        </div>

        {/* Instant unlock */}
        <div className={styles.settingRow}>
          <label className={styles.settingInfo} htmlFor="toggle-instant-unlock">
            <span className={styles.settingLabel}>Instant unlock mode</span>
            <span className={styles.settingHint}>
              Skips the unlock transition entirely for the fastest vault access.
            </span>
          </label>
          <Toggle
            id="toggle-instant-unlock"
            checked={local.instant_unlock}
            onChange={(val) => update({ instant_unlock: val })}
            ariaLabel="Skip unlock animation entirely"
          />
        </div>
      </section>

      {/* ── 🖥 Window & Behavior ────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Window & Behavior</h3>
        <p className={styles.sectionDesc}>
          Control how Smart Vault behaves as a desktop application.
        </p>

        {/* Close to tray */}
        <div className={styles.settingRow}>
          <label className={styles.settingInfo} htmlFor="toggle-close-tray">
            <span className={styles.settingLabel}>Close to tray</span>
            <span className={styles.settingHint}>
              Minimize to system tray instead of quitting when the window is
              closed.
            </span>
          </label>
          <Toggle
            id="toggle-close-tray"
            checked={local.close_to_tray}
            onChange={(val) => update({ close_to_tray: val })}
            ariaLabel="Close to system tray instead of quitting"
          />
        </div>

        {/* Lock on minimize */}
        <div className={styles.settingRow}>
          <label
            className={styles.settingInfo}
            htmlFor="toggle-lock-minimize"
          >
            <span className={styles.settingLabel}>Lock when minimized</span>
            <span className={styles.settingHint}>
              Vault locks instantly when the app window is minimized to the
              taskbar.
            </span>
          </label>
          <Toggle
            id="toggle-lock-minimize"
            checked={local.lock_on_minimize}
            onChange={(val) => update({ lock_on_minimize: val })}
            ariaLabel="Lock vault when app is minimized"
          />
        </div>

        {/* Global shortcut toggle */}
        <div className={styles.settingRow}>
          <label
            className={styles.settingInfo}
            htmlFor="toggle-global-shortcut"
          >
            <span className={styles.settingLabel}>Enable global shortcut</span>
            <span className={styles.settingHint}>
              Register a system-wide keyboard shortcut to bring Smart Vault to
              the front.
            </span>
          </label>
          <Toggle
            id="toggle-global-shortcut"
            checked={local.global_shortcut_enabled}
            onChange={handleShortcutToggle}
            ariaLabel="Enable global keyboard shortcut"
          />
        </div>

        {/* Shortcut keybinding */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <span className={styles.settingLabel}>Shortcut keybinding</span>
            <span className={styles.settingHint}>
              Click the field to edit. Press Enter or click away to apply.
            </span>
          </div>
          <div className={styles.shortcutColumn}>
            <div className={styles.shortcutGroup}>
              <input
                className={styles.shortcutInput}
                value={shortcutInput}
                onChange={(e) => {
                  setShortcutInput(e.target.value);
                  setShortcutError(null);
                }}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => commitShortcut(e.target.value)}
                onKeyDown={handleShortcutKeyDown}
                disabled={!local.global_shortcut_enabled}
                spellCheck={false}
                autoComplete="off"
                aria-label="Global shortcut keybinding"
              />
              <button
                className={styles.resetBtn}
                onClick={resetShortcut}
                disabled={
                  !local.global_shortcut_enabled ||
                  local.global_shortcut === DEFAULT_SHORTCUT
                }
                title="Reset to default"
              >
                ↺
              </button>
            </div>
            {shortcutError && (
              <span className={styles.shortcutError}>{shortcutError}</span>
            )}
          </div>
        </div>

        {/* Restore window state */}
        <div className={styles.settingRow}>
          <label
            className={styles.settingInfo}
            htmlFor="toggle-restore-window"
          >
            <span className={styles.settingLabel}>
              Restore last window state
            </span>
            <span className={styles.settingHint}>
              Remember the window position and size when reopening.
            </span>
          </label>
          <Toggle
            id="toggle-restore-window"
            checked={local.restore_window_state}
            onChange={(val) => update({ restore_window_state: val })}
            ariaLabel="Restore last window position and size"
          />
        </div>
      </section>

      {/* ── 💾 Backup & Restore ─────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Backup & Restore</h3>
        <p className={styles.sectionDesc}>
          Securely export or import your vault using encrypted{" "}
          <code className={styles.code}>.svault</code> files.
        </p>

        {backupStatus && (
          <div
            className={
              backupStatus.type === "success"
                ? styles.alertSuccess
                : styles.alertError
            }
          >
            {backupStatus.msg}
          </div>
        )}

        <div className={styles.buttonRow}>
          <button className={styles.actionBtn} onClick={handleExport}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            Export Vault
          </button>
          <button className={styles.actionBtn} onClick={handleImport}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            Import Vault
          </button>
        </div>

        {/* Last backup date */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <span className={styles.settingLabel}>Last backup</span>
            <span className={styles.settingHint}>
              {local.last_backup_date
                ? new Date(local.last_backup_date).toLocaleString()
                : "No backup yet"}
            </span>
          </div>
          <span
            className={
              local.last_backup_date
                ? styles.statusBadge
                : styles.statusBadgeWarn
            }
          >
            {local.last_backup_date ? "✓ Backed up" : "Not backed up"}
          </span>
        </div>

        {/* Backup reminder */}
        <div className={styles.settingRow}>
          <label
            className={styles.settingInfo}
            htmlFor="toggle-backup-reminder"
          >
            <span className={styles.settingLabel}>Backup reminder</span>
            <span className={styles.settingHint}>
              Periodically remind you to back up your vault.
            </span>
          </label>
          <Toggle
            id="toggle-backup-reminder"
            checked={local.backup_reminder}
            onChange={(val) => update({ backup_reminder: val })}
            ariaLabel="Enable periodic backup reminders"
          />
        </div>
      </section>

      {/* ── � Document Storage ─────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Document Storage</h3>
        <p className={styles.sectionDesc}>
          Settings for encrypted document vault behaviour.
        </p>

        {/* Secure delete */}
        <div className={styles.settingRow}>
          <label
            className={styles.settingInfo}
            htmlFor="toggle-doc-secure-delete"
          >
            <span className={styles.settingLabel}>Secure delete</span>
            <span className={styles.settingHint}>
              Multi-pass overwrite before deletion — prevents forensic recovery.
            </span>
          </label>
          <Toggle
            id="toggle-doc-secure-delete"
            checked={local.doc_secure_delete}
            onChange={(val) => update({ doc_secure_delete: val })}
            ariaLabel="Enable secure file deletion"
          />
        </div>

        {/* Auto-cleanup temp files */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <span className={styles.settingLabel}>
              Auto-cleanup temp files
            </span>
            <span className={styles.settingHint}>
              Minutes before decrypted temp files are wiped (0 = manual only).
            </span>
          </div>
          <select
            className={styles.settingSelect}
            value={local.doc_auto_cleanup_minutes}
            onChange={(e) =>
              update({ doc_auto_cleanup_minutes: Number(e.target.value) })
            }
          >
            <option value={0}>Manual only</option>
            <option value={1}>1 minute</option>
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
          </select>
        </div>

        {/* Chunk size */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <span className={styles.settingLabel}>
              Encryption chunk size
            </span>
            <span className={styles.settingHint}>
              Size of each AES-256-GCM encryption block. Larger = faster for big files.
            </span>
          </div>
          <select
            className={styles.settingSelect}
            value={local.doc_chunk_size_mb}
            onChange={(e) =>
              update({ doc_chunk_size_mb: Number(e.target.value) })
            }
          >
            <option value={1}>1 MB</option>
            <option value={2}>2 MB</option>
            <option value={4}>4 MB (default)</option>
            <option value={8}>8 MB</option>
            <option value={16}>16 MB</option>
          </select>
        </div>

        {/* Encryption info badge */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <span className={styles.settingLabel}>Encryption algorithm</span>
            <span className={styles.settingHint}>
              AES-256-GCM with unique nonce per chunk. Always active.
            </span>
          </div>
          <span className={styles.statusBadge}>AES-256-GCM</span>
        </div>
      </section>

      {/* ── �📥 Data Import ──────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Data Import</h3>
        <p className={styles.sectionDesc}>
          Import passwords from browser CSV exports (Chrome, Edge, Bitwarden).
        </p>

        <div className={styles.buttonRow}>
          <button
            className={styles.actionBtn}
            onClick={() => setShowCsvModal(true)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            Import from CSV
          </button>
        </div>

        <div className={styles.importInfo}>
          <strong>Supported formats:</strong> Chrome, Edge, Bitwarden CSV
          exports. The importer auto‑detects column names and previews entries
          before importing.
        </div>
      </section>

      {/* ── CSV modal ───────────────────────────────────── */}
      {showCsvModal && (
        <CsvImportModal
          onClose={() => setShowCsvModal(false)}
          onSuccess={(count) => {
            setBackupStatus({
              type: "success",
              msg: `Imported ${count} ${count === 1 ? "entry" : "entries"} from CSV.`,
            });
          }}
        />
      )}

      {/* ── Vault Management ─────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Vault Management</h3>
        <p className={styles.sectionDesc}>
          Manage multiple vaults with independent master passwords.
        </p>

        {/* Current vault info */}
        {activeVaultName && (
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.settingLabel}>Active vault</span>
              <span className={styles.settingHint}>
                {activeVaultName}
                {activeVaultId ? ` (${activeVaultId.slice(0, 8)}…)` : ""}
              </span>
            </div>
            <span className={styles.statusBadge}>Active</span>
          </div>
        )}

        {/* Switch vault */}
        <div className={styles.buttonRow}>
          <button className={styles.actionBtn} onClick={onSwitchVault}>
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
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
            Switch Vault
          </button>
        </div>
      </section>

      {/* ── Encrypted Backup v2 (.smartbackup) ──────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Encrypted Backup (.smartbackup)</h3>
        <p className={styles.sectionDesc}>
          Export or import your vault as an encrypted .smartbackup file with
          integrity verification.
        </p>

        <div className={styles.buttonRow}>
          <button className={styles.actionBtn} onClick={handleExportV2}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Backup
          </button>
          <button className={styles.actionBtn} onClick={handleImportV2}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import Backup
          </button>
        </div>
      </section>

      {/* ── 📩 Support & Feedback ────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Support & Feedback</h3>
        <p className={styles.sectionDesc}>
          Smart Vault is fully offline. We do not collect or transmit any data.
        </p>

        <ReportSection clipboardClearSeconds={local.clipboard_clear_seconds} />
      </section>
    </div>
  );
};

export default SettingsPage;
