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
import type { AppSettings } from "./features/settings/types/settings.types";
import { DEFAULT_SETTINGS } from "./features/settings/types/settings.types";
import { ToastContainer, useToast } from "./shared/components/Toast";
import type { SectionId } from "./app/layout/Sidebar";

type AppView = "login" | "transitioning" | "app";

const TRANSITION_DURATION = 1600; // ms

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
      // Just trigger the transition animation.
      setView("transitioning");
    },
    []
  );

  // After the transition animation finishes, switch to app
  useEffect(() => {
    if (view !== "transitioning") return;
    const timer = setTimeout(() => setView("app"), TRANSITION_DURATION);
    return () => clearTimeout(timer);
  }, [view]);

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
        <div className="transition-overlay">
          <div className="transition-lock">
            <svg
              className="transition-lock-icon"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <p className="transition-text">Unlocking your vault…</p>
          <div className="transition-bar-track">
            <div className="transition-bar-fill" />
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
