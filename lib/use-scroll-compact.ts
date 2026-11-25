"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type Tracker = { get: () => boolean; set: (value: boolean) => void; subscribe: (fn: (compact: boolean) => void) => () => void };

/**
 * One reading of "is the reader heading down the page". The direction has to hold for `distance` pixels before it counts (a flick or a
 * bounce at the end of the page never flips it), and coming back up needs only half that, so the way back feels instant. It listens
 * only while something is subscribed.
 */
function makeTracker(distance: number, topZone: number, box: HTMLElement | null): Tracker {
  const listeners = new Set<(compact: boolean) => void>();
  const source: HTMLElement | Window = box ?? window;
  const read = () => (box ? box.scrollTop : window.scrollY);
  let compact = false;
  let last = 0;
  let run = 0;
  let frame = 0;
  const set = (value: boolean) => {
    run = 0;
    if (value === compact) return;
    compact = value;
    listeners.forEach((fn) => fn(value));
  };
  const flip = (value: boolean) => { if (value !== compact) set(value); };
  const tick = () => {
    frame = 0;
    const y = read();
    const delta = y - last;
    last = y;
    const atEnd = box ? y + box.clientHeight >= box.scrollHeight - 4 : y + window.innerHeight >= document.documentElement.scrollHeight - 4;
    if (y < topZone) { run = 0; flip(false); return; }
    if (atEnd || delta === 0) return;
    run = Math.sign(run) === Math.sign(delta) ? run + delta : delta;
    if (run > distance) flip(true);
    else if (run < -distance / 2) flip(false);
  };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(tick); };
  return {
    get: () => compact,
    set,
    subscribe(fn) {
      if (!listeners.size) { last = read(); source.addEventListener("scroll", onScroll, { passive: true }); }
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
        if (listeners.size) return;
        source.removeEventListener("scroll", onScroll);
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        compact = false;
        run = 0;
      };
    },
  };
}

// Everything that watches the window with the same numbers (the phone header, the row of pills, the ask bar) shares one tracker, so they all flip in
// the same frame. Separate counters drifted apart: the header could be gone while the bar still sat full width.
const shared = new Map<string, Tracker>();
const windowTracker = (distance: number, topZone: number) => {
  const key = `${distance}:${topZone}`;
  let tracker = shared.get(key);
  if (!tracker) { tracker = makeTracker(distance, topZone, null); shared.set(key, tracker); }
  return tracker;
};

/**
 * True while the reader is heading down the page, false when they head back up or are near the top. Read from the window: that is what scrolls in
 * the trip shell. Pass `target` for a box that scrolls on its own (a sheet's content). Pass `onChange` to be told about a flip instead of holding the
 * state: a page that only moves things with it (a header) must not render its whole list again on every flip.
 */
export function useScrollCompact({ enabled = true, distance = 36, topZone = 140, target, onChange }: { enabled?: boolean; distance?: number; topZone?: number; target?: RefObject<HTMLElement | null>; onChange?: (compact: boolean) => void } = {}) {
  const [compact, setCompact] = useState(false);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const trackerRef = useRef<Tracker | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const box = target?.current ?? null;
    if (target && !box) return;
    const tracker = box ? makeTracker(distance, topZone, box) : windowTracker(distance, topZone);
    trackerRef.current = tracker;
    const apply = (value: boolean) => (changeRef.current ? changeRef.current(value) : setCompact(value));
    const off = tracker.subscribe(apply);
    if (tracker.get()) apply(true);
    return () => { off(); trackerRef.current = null; setCompact(false); };
    // `target` is a ref object: the box it holds is what is watched.
  }, [enabled, distance, topZone, target]);
  const set = useCallback((value: boolean) => (trackerRef.current ? trackerRef.current.set(value) : setCompact(value)), []);
  return [compact, set] as const;
}
