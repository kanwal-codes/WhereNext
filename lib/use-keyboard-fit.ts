"use client";

import { useEffect, useState } from "react";

/**
 * Keeps a full-height phone screen honest about the on-screen keyboard. The layout viewport does not shrink when the
 * keyboard opens (iOS Safari, Chrome on Android): the visible part does (`visualViewport`), and iOS may also pan it so
 * the focused field is in view, which is what left the header and tabs scrolled away and the page stuck after the
 * keyboard went down. While a field is focused and the visible height has dropped, this publishes
 *   `--vvh`     the visible height, `--vv-top`  how far the visible area has been panned,
 *   `html[data-keyboard="open"]`
 * so CSS can fit the screen to what you can see; when the keyboard closes it removes them and scrolls back to the top.
 * Returns whether the keyboard is open, for things that should get out of its way.
 */
export function useKeyboardFit(enabled: boolean): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    const root = document.documentElement;
    let base = vv.height; // the visible height with no keyboard
    let frame = 0;
    let wasOpen = false;

    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);
    };

    const apply = () => {
      frame = 0;
      const isOpen = typing() && base - vv.height > 100;
      if (isOpen) {
        root.dataset.keyboard = "open";
        root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
        root.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
      } else {
        delete root.dataset.keyboard;
        root.style.removeProperty("--vvh");
        root.style.removeProperty("--vv-top");
        if (!typing()) base = vv.height;
        // The keyboard has just gone: put the page back where it belongs (iOS leaves it panned).
        if (wasOpen) window.scrollTo(0, 0);
      }
      if (isOpen !== wasOpen) {
        wasOpen = isOpen;
        setOpen(isOpen);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.keyboard;
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vv-top");
    };
  }, [enabled]);

  return open;
}
