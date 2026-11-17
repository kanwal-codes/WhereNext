"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True while the reader is heading down the page, false when they head back up or are near the top. The direction has to
 * hold for `distance` pixels before it counts (a flick or a bounce at the end of the page never flips it), and coming back
 * up needs only half that, so the way back feels instant. Read from the window: that is what scrolls in the trip shell.
 */
export function useScrollCompact({ enabled = true, distance = 36, topZone = 140, target }: { enabled?: boolean; distance?: number; topZone?: number; /** A box that scrolls on its own (a sheet's content) instead of the window. */ target?: RefObject<HTMLElement | null> } = {}) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const box = target?.current ?? null;
    if (target && !box) return;
    const read = () => (box ? box.scrollTop : window.scrollY);
    let last = read();
    let run = 0;
    let frame = 0;
    const tick = () => {
      frame = 0;
      const y = read();
      const delta = y - last;
      last = y;
      const atEnd = box ? y + box.clientHeight >= box.scrollHeight - 4 : y + window.innerHeight >= document.documentElement.scrollHeight - 4;
      if (y < topZone) { run = 0; setCompact(false); return; }
      if (atEnd || delta === 0) return;
      run = Math.sign(run) === Math.sign(delta) ? run + delta : delta;
      if (run > distance) setCompact(true);
      else if (run < -distance / 2) setCompact(false);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(tick); };
    const source: HTMLElement | Window = box ?? window;
    source.addEventListener("scroll", onScroll, { passive: true });
    return () => { source.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
    // `target` is a ref object: the box it holds is what is watched.
  }, [enabled, distance, topZone, target]);
  return [compact, setCompact] as const;
}
