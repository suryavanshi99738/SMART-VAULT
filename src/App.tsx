import React, { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import Login from "./features/auth/pages/Login";
import AppShell from "./app/layout/AppShell";
import { VaultProvider } from "./features/vault/context/VaultContext";
import { ThemeProvider } from "./app/context/ThemeContext";
import {
  UISettingsProvider,
  osPreferReducedMotion,
} from "./app/context/UISettingsContext";
import { useAutoLock } from "./features/vault/hooks/useAutoLock";
import VaultDashboard from "./features/vault/pages/VaultDashboard";
import DashboardOverview from "./features/vault/pages/DashboardOverview";
import SettingsPage from "./features/settings/pages/SettingsPage";
import CategoriesPage from "./features/categories/pages/CategoriesPage";
import { useWindowLock } from "./features/settings/hooks/useWindowLock";
import type { LockReason } from "./features/settings/hooks/useWindowLock";
import { loadSettings, saveSettings } from "./features/settings/settingsService";
import {
  registerGlobalShortcut,
  unregisterGlobalShortcut,
} from "./features/settings/shortcutService";
import type { AppSettings } from "./features/settings/types/settings.types";
import { DEFAULT_SETTINGS } from "./features/settings/types/settings.types";
import { ToastContainer, useToast } from "./shared/components/Toast";
import type { SectionId } from "./app/layout/Sidebar";

type AppView = "login" | "transitioning" | "app";

/**
 * Unlock transition duration (ms).
 * - Animations ON: clean cross-fade (~380ms)
 * - Reduced motion: opacity-only fade (~180ms)
 * - Instant unlock: 0ms
 */
const TRANSITION_MS = 380;
const TRANSITION_REDUCED_MS = 180;

const AppInner: React.FC = () => {
  const [view, setView] = useState<AppView>("login");
  const [userName, setUserName] = useState<string>("");
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const masterPasswordRef = useRef<string>("");

  // ── Settings ───────────────────────────────────────────────
  const [settings, setSettings] = useState<AppSettings>({
    ...DEFAULT_SETTINGS,
    // Apply OS preference immediately before settings load from disk
    // to avoid a momentary flash of the wrong animation state.
    enable_animations: !osPreferReducedMotion(),
  });

  // Load persisted settings once on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await loadSettings();
        // First-launch detection: honour OS prefers-reduced-motion if the
        // user has never explicitly set an animation preference.
        const initialized = localStorage.getItem("sv_ui_initialized");
        if (!initialized) {
          if (osPreferReducedMotion()) {
            saved.enable_animations = false;
          }
          localStorage.setItem("sv_ui_initialized", "1");
          // Persist the OS-derived default so subsequent launches are instant
          await saveSettings(saved).catch(() => {
            /* non-fatal */
          });
        }
        setSettings(saved);
      } catch {
        /* use defaults */
      }
    })();
  }, []);

  const handleSettingsChange = useCallback((updated: AppSettings) => {
    setSettings(updated);
    // Persist async — failure is non-fatal
    saveSettings(updated).catch(console.error);
  }, []);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const { toasts, showToast, dismissToast } = useToast();

  // ── Lock ──────────────────────────────────────────────────────────────────
  const handleLock = useCallback(() => {
    setView("login");
    setUserName("");
    setActiveSection("dashboard");
    masterPasswordRef.current = "";
  }, []);

  /**
   * Auto-lock triggered by a window event (minimize / focus-loss).
   * The backend has already cleared the key; we just update the UI + show toast.
   */
  const handleAutoLock = useCallback(
    (reason: LockReason) => {
      handleLock();
      showToast({
        title: "Vault locked",
        message:
          reason === "minimize"
            ? "App was minimized — vault secured."
            : "App lost focus — vault secured.",
        type: "warning",
        duration: 4000,
      });
    },
    [handleLock, showToast]
  );

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  // ── Hooks ─────────────────────────────────────────────────────────────────

  // Inactivity auto-lock (only while inside the app)
  useAutoLock(handleLock, view === "app", settings.auto_lock_minutes * 60 * 1000);

  // Window minimize / focus-loss auto-lock
  useWindowLock({
    settings,
    isActive: view === "app",
    onLocked: handleAutoLock,
  });

  // ── Tray "Lock Vault" event ───────────────────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("vault-locked-from-tray", () => {
          handleLock();
        });
      } catch {
        /* not in Tauri env */
      }
    })();
    return () => unlisten?.();
  }, [handleLock]);

  // ── Global shortcut registration ──────────────────────────────────────────
  useEffect(() => {
    if (settings.global_shortcut_enabled && settings.global_shortcut) {
      registerGlobalShortcut(settings.global_shortcut).catch(() => {
        /* non-fatal */
      });
    }
    return () => {
      unregisterGlobalShortcut().catch(() => {});
    };
  }, [settings.global_shortcut_enabled, settings.global_shortcut]);

  // Alt+L keyboard shortcut to lock the vault
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "l" && view === "app") {
        e.preventDefault();
        handleLock();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, handleLock]);

  const handleLoginSuccess = useCallback(
    (name: string, masterPassword: string) => {
      setUserName(name);
      masterPasswordRef.current = masterPassword;
      // Vault is already unlocked by Login.tsx via unlock_vault command.
      if (settings.instant_unlock || !settings.enable_animations) {
        // Skip transition entirely
        setView("app");
      } else {
        setView("transitioning");
      }
    },
    [settings.instant_unlock, settings.enable_animations]
  );

  // After the transition animation finishes, switch to app
  useEffect(() => {
    if (view !== "transitioning") return;
    const duration = settings.reduced_motion ? TRANSITION_REDUCED_MS : TRANSITION_MS;
    const timer = setTimeout(() => setView("app"), duration);
    return () => clearTimeout(timer);
  }, [view, settings.reduced_motion]);

  // ── Render ────────────────────────────────────────────────────────────────

  const renderSection = () => {
    switch (activeSection) {
      case "dashboard":
        return <DashboardOverview />;
      case "vault":
        return <VaultDashboard />;
      case "categories":
        return <CategoriesPage />;
      case "settings":
        return (
          <SettingsPage
            settings={settings}
            onSettingsChange={handleSettingsChange}
            masterPassword={masterPasswordRef.current}
          />
        );
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <>
      {/* Toast notifications — rendered above all views */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* UISettingsProvider applies body.compact-mode / body.reduced-motion
          via useLayoutEffect so classes are present before any child paints */}
      <UISettingsProvider
        compactMode={settings.compact_mode}
        animationsEnabled={settings.enable_animations}
      >

      {view === "login" && (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}

      {view === "transitioning" && (
        <div
          className={`unlock-transition ${settings.reduced_motion ? "unlock-transition--reduced" : ""}`}
          aria-live="polite"
          aria-label="Unlocking vault"
        >
          <div className="unlock-transition__card">
            <svg
              className="unlock-transition__icon"
              viewBox="0 0 24 24"
              width="28"
              height="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path className="unlock-transition__shackle" d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="unlock-transition__text">Smart Vault</p>
          </div>
        </div>
      )}

      {view === "app" && (
        <VaultProvider>
          <div className="dashboard-enter">
            <AppShell
              userName={userName}
              onLock={handleLock}
              activeSection={activeSection}
              onNavigate={setActiveSection}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={toggleSidebar}
            >
              {renderSection()}
            </AppShell>
          </div>
        </VaultProvider>
      )}
      </UISettingsProvider>
    </>
  );
};

const App: React.FC = () => (
  <ThemeProvider>
    <AppInner />
  </ThemeProvider>
);

export default App;
