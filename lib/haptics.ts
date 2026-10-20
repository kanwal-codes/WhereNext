/**
 * A short buzz on Android Chrome for the moments that deserve one (a message leaving, a switch flipping, a stop added). It is a
 * no-op everywhere that cannot vibrate (iOS Safari, desktop) and for people who asked for less motion. Never throws: some
 * browsers refuse it outside a user gesture, and that must not take the action down with it.
 */
const PATTERNS = { tap: 8, select: 10, success: [12, 40, 12] } as const;

export function haptic(kind: keyof typeof PATTERNS = "tap") {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(PATTERNS[kind] as number | number[]);
  } catch {
    /* no-op */
  }
}
