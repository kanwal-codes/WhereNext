"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keeps a scroll container where the reader left it when its WIDTH changes (a side panel opening beside a chat narrows
 * the column, the text re-wraps and gets taller). Without this the scroll offset stays the same number while the content
 * under it grows, so the reader is suddenly higher up the conversation. It holds the distance from the bottom edge: at
 * the bottom they stay at the bottom, partway up they keep their place relative to the latest message.
 * Width changes that animate (the panel slides in over several frames) are followed frame by frame.
 */
export function useKeepScrollGap(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const gapNow = () => el.scrollHeight - el.scrollTop - el.clientHeight;
    // The widths the text wraps to: the container's and its content's (a chat narrows its content column itself when a panel opens).
    const widths = () => [el.clientWidth, ...Array.from(el.children).map((child) => (child as HTMLElement).offsetWidth)].join(",");
    let gap = gapNow();
    let width = widths();
    let restoring = false;
    const onScroll = () => {
      if (!restoring) gap = gapNow();
    };
    const observer = new ResizeObserver(() => {
      const now = widths();
      if (now === width) {
        // The content grew or shrank at the same width (a new message): remember where the reader is.
        if (!restoring) gap = gapNow();
        return;
      }
      width = now;
      restoring = true;
      el.scrollTop = el.scrollHeight - el.clientHeight - gap;
      requestAnimationFrame(() => {
        restoring = false;
      });
    });
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [ref]);
}
