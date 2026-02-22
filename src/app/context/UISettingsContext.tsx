// src/app/context/UISettingsContext.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Global UI behaviour context — manages compact mode and animation state.
//
// Responsibilities:
//  • Applies  `body.compact-mode`    when compact layout is enabled.
//  • Applies  `body.reduced-motion`  when animations are disabled.
//  • Detects OS `prefers-reduced-motion` at first load and uses it as the
//    default if no saved preference exists (stored in AppSettings).
//  • Body classes are applied synchronously via useLayoutEffect so there is
//    never a flash of un-styled content between setting load and first paint.
//
// No prop drilling — any component can call useUISettings() to react to the
// current compact / animation state (e.g., to skip conditional animation logic).
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
} from "react";

// ── Context shape ─────────────────────────────────────────────────────────────

interface UISettingsValue {
  /** Whether compact layout is active */
  compactMode: boolean;
  /** Whether animation / transition effects are enabled */
  animationsEnabled: boolean;
}

const UISettingsContext = createContext<UISettingsValue>({
  compactMode: false,
  animationsEnabled: true,
});

// ── OS reduced-motion detection ────────────────────────────────────────────────

/**
 * Returns `true` if the user's OS has "Reduce Motion" enabled.
 * Safe to call during SSR/non-browser environments.
 */
export function osPreferReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface UISettingsProviderProps {
  compactMode: boolean;
  animationsEnabled: boolean;
  children: React.ReactNode;
}

export const UISettingsProvider: React.FC<UISettingsProviderProps> = ({
  compactMode,
  animationsEnabled,
  children,
}) => {
  // Apply / remove body classes synchronously before first paint.
  // useLayoutEffect ensures the class is present when the browser paints,
  // preventing a layout flash.
  useLayoutEffect(() => {
    const body = document.body;
    body.classList.toggle("compact-mode", compactMode);
    return () => body.classList.remove("compact-mode");
  }, [compactMode]);

  useLayoutEffect(() => {
    const body = document.body;
    // reduced-motion class disables all CSS transitions/animations globally
    body.classList.toggle("reduced-motion", !animationsEnabled);
    return () => body.classList.remove("reduced-motion");
  }, [animationsEnabled]);

  const value = useMemo(
    () => ({ compactMode, animationsEnabled }),
    [compactMode, animationsEnabled]
  );

  return (
    <UISettingsContext.Provider value={value}>
      {children}
    </UISettingsContext.Provider>
  );
};

// ── Consumer hook ─────────────────────────────────────────────────────────────

/** Access global compact-mode and animation-enabled state from any component. */
export function useUISettings(): UISettingsValue {
  return useContext(UISettingsContext);
}
