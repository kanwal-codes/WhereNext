"use client";

import { useEffect, useState } from "react";

/**
 * True while the reader is heading down the page, false when they head back up or are near the top. The direction has to
 * hold for `distance` pixels before it counts (a flick or a bounce at the end of the page never flips it), and coming back
 * up needs only half that, so the way back feels instant. Read from the window: that is what scrolls in the trip shell.
 */
export function useScrollCompact({ enabled = true, distance = 36, topZone = 140 }: { enabled?: boolean; distance?: number; topZone?: number } = {}) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let last = window.scrollY;
    let run = 0;
    let frame = 0;
    const tick = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - last;
      last = y;
      const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 4;
      if (y < topZone) { run = 0; setCompact(false); return; }
      if (atEnd || delta === 0) return;
      run = Math.sign(run) === Math.sign(delta) ? run + delta : delta;
      if (run > distance) setCompact(true);
      else if (run < -distance / 2) setCompact(false);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(tick); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [enabled, distance, topZone]);
  return [compact, setCompact] as const;
}
