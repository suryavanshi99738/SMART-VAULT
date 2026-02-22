import { clearClipboard } from "../vault/services/vaultService";

let clipboardTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_CLEAR_SECONDS = 15;

/**
 * Schedule clipboard auto-clear after `seconds`.
 * Cancels any existing pending clear.
 */
export function scheduleClipboardClear(
  seconds: number = DEFAULT_CLEAR_SECONDS
): void {
  cancelClipboardClear();
  clipboardTimer = setTimeout(async () => {
    try {
      await clearClipboard();
    } catch (err) {
      console.error("Failed to clear clipboard:", err);
    }
    clipboardTimer = null;
  }, seconds * 1000);
}

/** Cancel any pending clipboard clear. */
export function cancelClipboardClear(): void {
  if (clipboardTimer !== null) {
    clearTimeout(clipboardTimer);
    clipboardTimer = null;
  }
}

/** Check if a clear is pending. */
export function isClipboardClearPending(): boolean {
  return clipboardTimer !== null;
}
