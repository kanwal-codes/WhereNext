"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True once the returned `ref` comes within `margin` px of being scrolled into view, then stays true.
 * For below-the-fold sections that fetch on mount: they wait until someone is heading their way.
 *
 * The root is the nearest scrolling ancestor, not the viewport. A detail panel scrolls inside its own
 * container, and an observer rooted on the viewport applies that container's clip with no margin, so it
 * would only fire once the section was already on screen.
 */
export function useNearView<T extends Element>(margin = 800) {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    let root: Element | null = el.parentElement;
    while (root && !/auto|scroll/.test(getComputedStyle(root).overflowY)) root = root.parentElement;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { root, rootMargin: `${margin}px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);

  return [ref, near] as const;
}
