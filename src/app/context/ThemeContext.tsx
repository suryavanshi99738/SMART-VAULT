import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  transparency: number;
  setTransparency: (t: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "smart-vault-theme";
const TRANSPARENCY_KEY = "ui_transparency";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? getSystemTheme() : mode;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system")
      return stored;
    return "system";
  });

  const [transparency, setTransparencyState] = useState<number>(() => {
    const stored = localStorage.getItem(TRANSPARENCY_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed >= 0.05 && parsed <= 0.25) return parsed;
    }
    return 0.08;
  });

  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    resolveTheme(mode)
  );

  // Persist and resolve on mode change
  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  }, []);

  const setTransparency = useCallback((t: number) => {
    setTransparencyState(t);
    localStorage.setItem(TRANSPARENCY_KEY, t.toString());
  }, []);

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    setResolved(resolveTheme(mode));

    if (mode !== "system") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolved(getSystemTheme());
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  // Apply data attribute to <html> so CSS variables kick in
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  // Apply transparency CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty("--glass-opacity", transparency.toString());
    document.documentElement.style.setProperty("--glass-blur", "20px");
  }, [transparency]);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode, transparency, setTransparency }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
