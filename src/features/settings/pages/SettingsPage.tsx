// src/features/settings/pages/SettingsPage.tsx
import React, { useCallback, useEffect, useState } from "react";
import { useTheme } from "../../../app/context/ThemeContext";
import type { ThemeMode } from "../../../app/context/ThemeContext";
import type { AppSettings } from "../types/settings.types";
import { exportVault, importVault } from "../backupService";
import {
  registerGlobalShortcut,
  unregisterGlobalShortcut,
} from "../shortcutService";
import CsvImportModal from "../components/CsvImportModal";
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

const DEFAULT_SHORTCUT = "Ctrl+Shift+V";

// ── Props ──────────────────────────────────────────────────────────────────────

interface SettingsPageProps {
  settings: AppSettings;
  onSettingsChange: (updated: AppSettings) => void;
  masterPassword?: string;
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
}) => {
  const { mode, setMode } = useTheme();
  const [local, setLocal] = useState<AppSettings>(settings);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const [shortcutInput, setShortcutInput] = useState(settings.global_shortcut);
  const [shortcutRecording, setShortcutRecording] = useState(false);

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

  // ── Shortcut keybinding recording ──────────────────────────────────────────
  const handleShortcutKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!shortcutRecording) return;
      e.preventDefault();

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Super");

      const key = e.key;
      // Ignore modifier-only presses
      if (
        ["Control", "Alt", "Shift", "Meta"].includes(key)
      )
        return;

      // Convert to Tauri accelerator format
      const keyName = key.length === 1 ? key.toUpperCase() : key;
      parts.push(keyName);

      const accelerator = parts.join("+");
      setShortcutInput(accelerator);
      setShortcutRecording(false);

      // Try to register the new shortcut
      (async () => {
        try {
          if (local.global_shortcut_enabled) {
            await registerGlobalShortcut(accelerator);
          }
          update({ global_shortcut: accelerator });
        } catch (err: unknown) {
          setBackupStatus({
            type: "error",
            msg: `Invalid shortcut: ${err instanceof Error ? err.message : String(err)}`,
          });
          setShortcutInput(local.global_shortcut);
        }
      })();
    },
    [shortcutRecording, local.global_shortcut_enabled, local.global_shortcut, update]
  );

  const resetShortcut = useCallback(async () => {
    setShortcutInput(DEFAULT_SHORTCUT);
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
        <h3 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>🔐</span> Security
        </h3>
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
        <h3 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>🎨</span> Appearance
        </h3>
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
        <h3 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>✦</span> Motion & Transitions
        </h3>
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
        <h3 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>🖥️</span> Window & Behavior
        </h3>
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
              {shortcutRecording
                ? "Press the desired key combination…"
                : "Click the field to record a new shortcut."}
            </span>
          </div>
          <div className={styles.shortcutGroup}>
            <input
              className={`${styles.shortcutInput} ${
                shortcutRecording ? styles.shortcutRecording : ""
              }`}
              value={shortcutInput}
              readOnly
              onFocus={() => setShortcutRecording(true)}
              onBlur={() => setShortcutRecording(false)}
              onKeyDown={handleShortcutKeyDown}
              disabled={!local.global_shortcut_enabled}
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
        <h3 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>💾</span> Backup & Restore
        </h3>
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

      {/* ── 📥 Data Import ──────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>📥</span> Data Import
        </h3>
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
    </div>
  );
};

export default SettingsPage;
