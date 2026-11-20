"use client";

import { useEffect, useState } from "react";

/**
 * Whether an on-screen keyboard is covering the bottom of the page, for a sheet that drops from the top: such a phone shrinks only the *visual*
 * viewport when the keyboard opens, so the sheet's own 88dvh still reaches under it and hides its last button. While `active`, this also sets
 * `--vvh` on the page to the visible height, which the sheet caps itself with (`max-h-[min(88dvh,var(--vvh))]`).
 */
export function useKeyboardInset(active: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => {
      document.documentElement.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      setOpen(window.innerHeight - vv.height > 120);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--vvh");
      setOpen(false);
    };
  }, [active]);
  return open;
}
