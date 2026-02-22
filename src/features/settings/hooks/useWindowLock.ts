// src/features/settings/hooks/useWindowLock.ts
// ─────────────────────────────────────────────────────────────────────────────
// Registers Tauri window event listeners to auto-lock the vault when the
// window is minimized or loses focus, according to the current settings.
//
// Design decisions:
// • All settings and state are accessed via refs so listeners are registered
//   exactly ONCE per mount — no teardown/re-register on every settings change.
// • A `lockingRef` mutex prevents concurrent lock calls if multiple events
//   fire near-simultaneously (e.g., blur fires while minimize is in progress).
// • On minimize, both visibilitychange AND blur can fire. The blur handler
//   checks `!document.hidden` so it only acts on a pure focus-loss, not
//   a minimize — preventing double-toast/double-lock.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import type { AppSettings } from "../types/settings.types";
import { lockVault } from "../../vault/services/vaultService";

export type LockReason = "minimize" | "hide";

interface Options {
  /** Current persisted settings — updated via ref, no re-registration needed. */
  settings: AppSettings;
  /** True only when the user is inside the app (view === "app"). */
  isActive: boolean;
  /**
   * Called after the backend lock succeeds.
   * Responsible for showing a toast and redirecting to the login screen.
   */
  onLocked: (reason: LockReason) => void;
}

export function useWindowLock({ settings, isActive, onLocked }: Options): void {
  // Refs let handlers see the latest values without re-registering listeners.
  const settingsRef = useRef(settings);
  const isActiveRef = useRef(isActive);
  // Guards against concurrent lock attempts.
  const lockingRef = useRef(false);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  useEffect(() => {
    let cancelled = false;
    let unlistenBlur: (() => void) | null = null;

    // ── Core lock logic ──────────────────────────────────────────────────────
    const performLock = async (reason: LockReason) => {
      // Guard: vault must be open and no other lock operation in flight.
      if (!isActiveRef.current || lockingRef.current) return;
      lockingRef.current = true;
      try {
        await lockVault();
        onLocked(reason);
      } catch {
        // Best-effort: even if the backend call fails, redirect to login so
        // the UI is not left in a partially-locked state.
        onLocked(reason);
      } finally {
        lockingRef.current = false;
      }
    };

    // ── Handler: window minimized / visibility hidden ────────────────────────
    // On Windows with WebView2, minimizing sets document.hidden = true.
    const onVisibilityChange = () => {
      if (document.hidden && settingsRef.current.lock_on_minimize) {
        void performLock("minimize");
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // ── Handler: window lost focus (app switch, not minimize) ─────────────
    // Tauri blur fires on both minimize AND app-switch. We only want the
    // app-switch case here, so we skip when document.hidden (minimize).
    const onBlur = () => {
      if (!document.hidden && settingsRef.current.lock_on_hide) {
        void performLock("hide");
      }
    };

    // Register the Tauri window listener asynchronously.
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        // win.listen returns an unlisten function.
        const unlisten = await win.listen("tauri://blur", onBlur);
        if (cancelled) {
          // Cleanup already ran while we were awaiting — call unlisten immediately.
          unlisten();
        } else {
          unlistenBlur = unlisten;
        }
      } catch {
        // Running outside Tauri (e.g., browser dev server) — skip silently.
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unlistenBlur?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Empty dep array: intentional. All reactive state is accessed via refs.
}
