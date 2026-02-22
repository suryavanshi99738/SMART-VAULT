// src/features/settings/pages/SettingsPage.tsx
import React, { useEffect, useState } from "react";
import { useTheme } from "../../../app/context/ThemeContext";
import type { ThemeMode } from "../../../app/context/ThemeContext";
import type { AppSettings } from "../types/settings.types";
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

// ── Props ──────────────────────────────────────────────────────────────────────

interface SettingsPageProps {
  settings: AppSettings;
  onSettingsChange: (updated: AppSettings) => void;
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
}) => {
  const { mode, setMode } = useTheme();
  // Local mirror so the UI responds immediately while async save is in flight
  const [local, setLocal] = useState<AppSettings>(settings);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  const update = (patch: Partial<AppSettings>) => {
    const updated = { ...local, ...patch };
    setLocal(updated);
    onSettingsChange(updated);
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Settings</h2>
      <p className={styles.subtitle}>Customize your Smart Vault experience.</p>

      {/* ── Appearance ──────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Appearance</h3>
        <p className={styles.sectionDesc}>
          Choose how Smart Vault looks to you. Select a theme below.
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
              Enable UI transitions and motion effects. Disable for instant
              interactions or if you prefer reduced motion.
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

      {/* ── Security ────────────────────────────────────── */}
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
      </section>

      {/* ── Window Lock ─────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Window Lock</h3>
        <p className={styles.sectionDesc}>
          Automatically lock the vault when the app window changes state.
          The encryption key is cleared from memory immediately.
        </p>

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
      </section>
    </div>
  );
};

export default SettingsPage;
