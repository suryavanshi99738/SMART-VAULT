import { useEffect, useRef, useCallback } from "react";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Monitors user activity and calls `onLock` after a configurable period of inactivity.
 * Resets on mousemove, keydown, and click.
 *
 * @param onLock    Callback invoked when inactivity threshold is reached.
 * @param enabled   Whether the auto-lock timer is active.
 * @param timeoutMs Inactivity duration in milliseconds (default 5 min).
 */
export function useAutoLock(
  onLock: () => void,
  enabled: boolean = true,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      onLock();
    }, timeoutMs);
  }, [onLock, timeoutMs]);

  useEffect(() => {
    if (!enabled) return;

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "keydown",
      "click",
    ];

    events.forEach((evt) => window.addEventListener(evt, resetTimer));
    resetTimer(); // start initial timer

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer, enabled]);
}
