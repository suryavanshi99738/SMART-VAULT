import React, { useEffect, useState } from "react";
import styles from "./Login.module.css";

// Safe wrapper: resolves the invoke function only when the Tauri IPC bridge is available.
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // In Tauri v2 the IPC primitives live on window.__TAURI_INTERNALS__
  // The @tauri-apps/api/core module reads from that object at import time,
  // so we lazy-import to guarantee the bridge has been injected.
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// ── Types ──────────────────────────────────────────────────────────────────────

type AuthMode = "loading" | "setup" | "login";

interface AuthResult {
  success: boolean;
  remaining_attempts: number;
  lockout_seconds: number;
}

interface LoginFormState {
  name: string;
  password: string;
  rememberDevice: boolean;
  showPassword: boolean;
  isLoading: boolean;
  errorMessage: string;
  authMode: AuthMode;
  remainingAttempts: number;
  lockoutSeconds: number;
}

interface LoginProps {
  onLoginSuccess: (name: string, masterPassword: string) => void;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const LockIcon: React.FC = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#ffffff"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const EyeOpenIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeClosedIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const AlertIcon: React.FC = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ── Main Component ─────────────────────────────────────────────────────────────

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [formState, setFormState] = useState<LoginFormState>({
    name: "",
    password: "",
    rememberDevice: false,
    showPassword: false,
    isLoading: false,
    errorMessage: "",
    authMode: "loading",
    remainingAttempts: 5,
    lockoutSeconds: 0,
  });

  // Check whether a master password already exists on mount
  useEffect(() => {
    tauriInvoke<boolean>("check_if_master_exists")
      .then((exists) => {
        setFormState((prev) => ({
          ...prev,
          authMode: exists ? "login" : "setup",
        }));
      })
      .catch(() => {
        setFormState((prev) => ({ ...prev, authMode: "setup" }));
      });
  }, []);

  const isNameEmpty = formState.name.trim().length === 0;
  const isPasswordEmpty = formState.password.trim().length === 0;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({
      ...prev,
      name: e.target.value,
      errorMessage: "",
    }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({
      ...prev,
      password: e.target.value,
      errorMessage: "",
    }));
  };

  const handleRememberDeviceChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormState((prev) => ({ ...prev, rememberDevice: e.target.checked }));
  };

  const handleTogglePassword = () => {
    setFormState((prev) => ({ ...prev, showPassword: !prev.showPassword }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isNameEmpty) {
      setFormState((prev) => ({
        ...prev,
        errorMessage: "Name or nickname is required.",
      }));
      return;
    }

    if (isPasswordEmpty) {
      setFormState((prev) => ({
        ...prev,
        errorMessage: "Master password is required.",
      }));
      return;
    }

    setFormState((prev) => ({ ...prev, isLoading: true, errorMessage: "" }));

    try {
      if (formState.authMode === "setup") {
        // First-time setup: hash and persist the master password, then unlock
        await tauriInvoke<boolean>("set_master_password", {
          password: formState.password,
        });
        // Immediately derive key and store in VaultState — same single call as login
        const result = await tauriInvoke<AuthResult>("unlock_vault", {
          password: formState.password,
        });
        if (result.success) {
          onLoginSuccess(formState.name.trim(), formState.password);
        } else {
          setFormState((prev) => ({
            ...prev,
            isLoading: false,
            errorMessage: "Setup succeeded but vault could not be unlocked. Please restart.",
          }));
        }
      } else {
        // Returning user: verify + derive key in a single atomic call
        const result = await tauriInvoke<AuthResult>("unlock_vault", {
          password: formState.password,
        });

        if (result.success) {
          onLoginSuccess(formState.name.trim(), formState.password);
        } else if (result.lockout_seconds > 0) {
          setFormState((prev) => ({
            ...prev,
            isLoading: false,
            remainingAttempts: result.remaining_attempts,
            lockoutSeconds: result.lockout_seconds,
            errorMessage: `Too many failed attempts. Try again in ${result.lockout_seconds} seconds.`,
          }));
        } else {
          setFormState((prev) => ({
            ...prev,
            isLoading: false,
            remainingAttempts: result.remaining_attempts,
            errorMessage:
              result.remaining_attempts > 0
                ? `Incorrect master password. ${result.remaining_attempts} attempt${result.remaining_attempts === 1 ? "" : "s"} remaining.`
                : "Incorrect master password.",
          }));
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Authentication failed. Please try again.";
      setFormState((prev) => ({
        ...prev,
        isLoading: false,
        errorMessage: message,
      }));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card} role="main">

        {/* Brand */}
        <div className={styles.brand}>
          <div className={styles.brandIcon} aria-hidden="true">
            <LockIcon />
          </div>
          <h1 className={styles.title}>Smart Vault</h1>
          <p className={styles.subtitle}>
            {formState.authMode === "setup"
              ? "Create your master password"
              : "Secure Password Manager"}
          </p>
        </div>

        {/* Form */}
        <form className={styles.form} onSubmit={handleSubmit} noValidate>

          {/* Name / Nickname Field */}
          <div className={styles.fieldGroup}>
            <label htmlFor="user-name" className={styles.label}>
              Name / Nickname
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="user-name"
                type="text"
                className={styles.input}
                value={formState.name}
                onChange={handleNameChange}
                placeholder="e.g. Alex"
                autoComplete="nickname"
                autoFocus
                aria-describedby="password-error"
                aria-invalid={formState.errorMessage.length > 0}
              />
            </div>
          </div>

          {/* Master Password Field */}
          <div className={styles.fieldGroup}>
            <label htmlFor="master-password" className={styles.label}>
              Master Password
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="master-password"
                type={formState.showPassword ? "text" : "password"}
                className={styles.input}
                value={formState.password}
                onChange={handlePasswordChange}
                placeholder="Enter your master password"
                autoComplete="current-password"
                aria-describedby="password-error"
                aria-invalid={formState.errorMessage.length > 0}
              />
              <button
                type="button"
                className={styles.toggleButton}
                onClick={handleTogglePassword}
                aria-label={
                  formState.showPassword ? "Hide password" : "Show password"
                }
                tabIndex={0}
              >
                {formState.showPassword ? <EyeClosedIcon /> : <EyeOpenIcon />}
              </button>
            </div>
          </div>

          {/* Error Area */}
          <div className={styles.errorArea} id="password-error" role="alert" aria-live="polite">
            {formState.errorMessage && (
              <p className={styles.errorText}>
                <AlertIcon />
                {formState.errorMessage}
              </p>
            )}
          </div>

          {/* Remember Device */}
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={formState.rememberDevice}
              onChange={handleRememberDeviceChange}
            />
            <span className={styles.checkboxLabel}>Remember this device</span>
          </label>

          {/* Submit Button */}
          <button
            type="submit"
            className={styles.loginButton}
            disabled={isNameEmpty || isPasswordEmpty || formState.isLoading}
            aria-busy={formState.isLoading}
          >
            {formState.isLoading && (
              <span className={styles.spinner} aria-hidden="true" />
            )}
            {formState.isLoading
              ? formState.authMode === "setup"
                ? "Setting up…"
                : "Unlocking…"
              : formState.authMode === "setup"
                ? "Create & Enter"
                : "Unlock Vault"}
          </button>

        </form>

        {/* Footer */}
        <footer className={styles.footer}>
          <p className={styles.footerText}>
            Your data is encrypted locally and never leaves your device.
          </p>
        </footer>

      </div>
    </div>
  );
};

export default Login;
