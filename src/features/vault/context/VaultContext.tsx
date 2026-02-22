import React, { createContext, useContext, useReducer } from "react";
import type { VaultEntry, VaultState } from "../types/vault.types";

// ── Actions ───────────────────────────────────────────────────────────────────

type VaultAction =
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_ENTRIES"; entries: VaultEntry[] }
  | { type: "ADD_ENTRY"; entry: VaultEntry }
  | { type: "UPDATE_ENTRY"; entry: VaultEntry }
  | { type: "DELETE_ENTRY"; id: string }
  | { type: "LOCK" };

// ── Reducer ───────────────────────────────────────────────────────────────────

const initialState: VaultState = {
  entries: [],
  loading: false,
  error: null,
  isLocked: false,
};

function vaultReducer(state: VaultState, action: VaultAction): VaultState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    case "SET_ENTRIES":
      return { ...state, entries: action.entries, loading: false, error: null };
    case "ADD_ENTRY":
      return {
        ...state,
        entries: [action.entry, ...state.entries],
        loading: false,
        error: null,
      };
    case "UPDATE_ENTRY":
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === action.entry.id
            ? { ...action.entry, created_at: e.created_at }
            : e
        ),
        loading: false,
        error: null,
      };
    case "DELETE_ENTRY":
      return {
        ...state,
        entries: state.entries.filter((e) => e.id !== action.id),
        loading: false,
        error: null,
      };
    case "LOCK":
      return { ...initialState, isLocked: true };
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface VaultContextValue {
  state: VaultState;
  dispatch: React.Dispatch<VaultAction>;
}

const VaultContext = createContext<VaultContextValue | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(vaultReducer, initialState);

  return (
    <VaultContext.Provider value={{ state, dispatch }}>
      {children}
    </VaultContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVaultContext(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) {
    throw new Error("useVaultContext must be used inside <VaultProvider>");
  }
  return ctx;
}
