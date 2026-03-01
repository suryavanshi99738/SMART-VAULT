// src/features/vault/context/ActiveVaultContext.tsx
// Holds the currently-selected vault ID/name plus the full vault list.
// Lives above the app shell so every component can read/switch vaults.

import React, { createContext, useCallback, useContext, useState } from "react";
import type { VaultMeta } from "../services/multiVaultService";
import { listVaults as fetchVaultList } from "../services/multiVaultService";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ActiveVaultState {
  /** Currently selected vault ID (null = none selected yet). */
  currentVaultId: string | null;
  /** Display name of the current vault. */
  currentVaultName: string;
  /** All vaults in the index. */
  vaults: VaultMeta[];
}

interface ActiveVaultContextValue extends ActiveVaultState {
  /** Select a vault (does NOT unlock — caller must navigate to login). */
  setVault: (id: string, name: string) => void;
  /** Deselect + clear vault state (used on lock / switch). */
  clearVault: () => void;
  /** Reload the vault list from disk. */
  refreshVaults: () => Promise<VaultMeta[]>;
}

// ── Context ────────────────────────────────────────────────────────────────────

const ActiveVaultContext = createContext<ActiveVaultContextValue | undefined>(
  undefined
);

// ── Provider ───────────────────────────────────────────────────────────────────

export const ActiveVaultProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<ActiveVaultState>({
    currentVaultId: null,
    currentVaultName: "",
    vaults: [],
  });

  const setVault = useCallback((id: string, name: string) => {
    setState((prev) => ({
      ...prev,
      currentVaultId: id,
      currentVaultName: name,
    }));
  }, []);

  const clearVault = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentVaultId: null,
      currentVaultName: "",
    }));
  }, []);

  const refreshVaults = useCallback(async (): Promise<VaultMeta[]> => {
    try {
      const list = await fetchVaultList();
      setState((prev) => ({ ...prev, vaults: list }));
      return list;
    } catch {
      return [];
    }
  }, []);

  return (
    <ActiveVaultContext.Provider
      value={{
        ...state,
        setVault,
        clearVault,
        refreshVaults,
      }}
    >
      {children}
    </ActiveVaultContext.Provider>
  );
};

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useActiveVault(): ActiveVaultContextValue {
  const ctx = useContext(ActiveVaultContext);
  if (!ctx) {
    throw new Error(
      "useActiveVault must be used inside <ActiveVaultProvider>"
    );
  }
  return ctx;
}
