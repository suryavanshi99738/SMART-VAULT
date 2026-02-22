import { useCallback } from "react";
import { useVaultContext } from "../context/VaultContext";
import * as svc from "../services/vaultService";
import type { VaultEntryPayload } from "../types/vault.types";

export function useVault() {
  const { state, dispatch } = useVaultContext();

  const fetchEntries = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const entries = await svc.getAllEntries();
      dispatch({ type: "SET_ENTRIES", entries });
    } catch (err: unknown) {
      dispatch({ type: "SET_ERROR", error: extractMsg(err) });
    }
  }, [dispatch]);

  const addEntry = useCallback(
    async (payload: VaultEntryPayload) => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        // Service now returns the new entry's UUID string
        const id = await svc.addEntry(payload);
        const now = Math.floor(Date.now() / 1000);
        const entry = {
          id,
          service_name: payload.service_name,
          username: payload.username,
          email: payload.email,
          category: payload.category,
          notes: payload.notes,
          created_at: now,
          updated_at: now,
        };
        dispatch({ type: "ADD_ENTRY", entry });
      } catch (err: unknown) {
        dispatch({ type: "SET_ERROR", error: extractMsg(err) });
        throw err;
      }
    },
    [dispatch]
  );

  const updateEntry = useCallback(
    async (id: string, payload: VaultEntryPayload) => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        // Service now returns void — build the updated entry from local state
        await svc.updateEntry(id, payload);
        const now = Math.floor(Date.now() / 1000);
        const existing = state.entries.find((e) => e.id === id);
        const entry = {
          id,
          service_name: payload.service_name,
          username: payload.username,
          email: payload.email,
          category: payload.category,
          notes: payload.notes,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        dispatch({ type: "UPDATE_ENTRY", entry });
      } catch (err: unknown) {
        dispatch({ type: "SET_ERROR", error: extractMsg(err) });
        throw err;
      }
    },
    [dispatch, state.entries]
  );

  const removeEntry = useCallback(
    async (id: string) => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        await svc.deleteEntry(id);
        dispatch({ type: "DELETE_ENTRY", id });
      } catch (err: unknown) {
        dispatch({ type: "SET_ERROR", error: extractMsg(err) });
      }
    },
    [dispatch]
  );

  const lockVault = useCallback(async () => {
    try {
      await svc.lockVault();
    } catch {
      // best-effort
    }
    dispatch({ type: "LOCK" });
  }, [dispatch]);

  return { state, fetchEntries, addEntry, updateEntry, removeEntry, lockVault };
}

function extractMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "An unexpected error occurred.";
}
