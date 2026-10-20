import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboardFit } from "@/lib/use-keyboard-fit";

/**
 * On a phone the Roam | Chat row floats over the top of the conversation and slides away as you read down, and comes back the moment you
 * scroll up (or reach the top, or switch tabs). It also steps out of the way while the keyboard is up. `resetOn` is the tab: changing it brings the row back.
 */
export function useChromeScroll({ desktop, resetOn }: { desktop: boolean; resetOn: unknown }) {
  const keyboardOpen = useKeyboardFit(!desktop);
  const [scrolledAway, setScrolledAway] = useState(false);
  const scrollTrack = useRef(new WeakMap<Element, { top: number; run: number }>());
  const onLogScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const top = el.scrollTop;
    const max = el.scrollHeight - el.clientHeight;
    const t = scrollTrack.current.get(el) ?? { top, run: 0 };
    const delta = top - t.top;
    t.top = top;
    // Rubber-banding past either end reports movement that is not the reader's.
    if (top > 0 && top < max) t.run = Math.sign(delta) === Math.sign(t.run) ? t.run + delta : delta;
    scrollTrack.current.set(el, t);
    if (top < 32) setScrolledAway(false);
    else if (t.run > 28) setScrolledAway(true);
    else if (t.run < -14) setScrolledAway(false);
  }, []);
  useEffect(() => setScrolledAway(false), [resetOn]);

  return { keyboardOpen, scrolledAway, onLogScroll };
}
