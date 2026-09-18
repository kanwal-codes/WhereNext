"use client";

import { useCallback, useEffect, type RefObject } from "react";

/** Grows past one line as the text wraps, up to this height (~3 lines at the composers'
 *  text-sm/leading-relaxed), then stays put — the textarea scrolls internally instead of
 *  pushing the rest of the page around for a long paste. Shared so every composer's cap
 *  (and the point where it switches to scrolling) stays the same. */
export const COMPOSER_TEXTAREA_MAX_HEIGHT = 88;

/** Auto-grows `ref`'s textarea to fit `value`, capped at `maxHeightPx`. Re-measures on every
 *  value change and whenever the textarea's own width changes (a side panel opening/closing,
 *  a viewport rotation reflows the wrapped text without the value itself changing). */
export function useAutoGrowTextarea(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxHeightPx: number = COMPOSER_TEXTAREA_MAX_HEIGHT) {
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeightPx)}px`;
  }, [ref, maxHeightPx]);

  useEffect(() => resize(), [value, resize]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, resize]);
}
