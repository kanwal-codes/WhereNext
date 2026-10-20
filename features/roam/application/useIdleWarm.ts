import { useEffect, useState } from "react";

/** True once the browser is idle (or 1.5 s has passed): the pane you are not on is built then, not while the page is still arriving. */
export function useIdleWarm() {
  // (The pane is also mounted at once if you switch to it first; the shell decides that.)
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    let idleId = 0;
    const timer = window.setTimeout(() => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(() => setWarm(true), { timeout: 1500 });
      else setWarm(true);
    }, 1500);
    return () => {
      window.clearTimeout(timer);
      if (idleId) (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
    };
  }, []);
  return warm;
}
