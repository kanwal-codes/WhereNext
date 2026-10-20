"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Grows past one line as the text wraps, up to this height (~3 lines at the composers'
 *  text-sm/leading-relaxed), then stays put — the textarea scrolls internally instead of
 *  pushing the rest of the page around for a long paste. Shared so every composer's cap
 *  (and the point where it switches to scrolling) stays the same. */
const COMPOSER_TEXTAREA_MAX_HEIGHT = 88;

/** Auto-grows `ref`'s textarea to fit `value`, capped at `maxHeightPx`. Re-measures on every
 *  value change and whenever the textarea's own width changes (a side panel opening/closing,
 *  a viewport rotation reflows the wrapped text without the value itself changing).
 *
 *  Returns whether the box has wrapped past its first line — a composer uses this to switch its
 *  buttons from sitting inline beside a single line of text to a fixed row below several.
 *
 *  Pass `mirrorRef` when that switch itself changes the textarea's OWN available width (e.g. its
 *  side padding shrinks once the buttons move out of the way) — point it at a hidden element
 *  permanently pinned to the single-line width, and the flip is decided from that instead of the
 *  real textarea. Without it in that situation, the decision would feed back on itself: growing
 *  the available width could let the very same text re-fit on one line, flipping back, narrowing
 *  the width again, wrapping it again — an infinite oscillation live-caught as a box that
 *  "gets stuck and won't shrink back down." Omit it when the textarea's width stays constant
 *  across the switch (that alone already prevents the loop). */
export function useAutoGrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeightPx: number = COMPOSER_TEXTAREA_MAX_HEIGHT,
  mirrorRef?: RefObject<HTMLElement | null>,
) {
  const [isMultiline, setIsMultiline] = useState(false);
  // Measured once, from the first (empty, one-line) layout — the yardstick every later
  // measurement is compared against to decide whether the text has actually wrapped.
  const singleLineHeight = useRef<number | null>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeightPx)}px`;

    const measured = mirrorRef?.current?.scrollHeight ?? el.scrollHeight;
    if (singleLineHeight.current == null) singleLineHeight.current = measured;
    setIsMultiline(measured > singleLineHeight.current + 1);
  }, [ref, mirrorRef, maxHeightPx]);

  useEffect(() => resize(), [value, resize]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, resize]);

  return isMultiline;
}
