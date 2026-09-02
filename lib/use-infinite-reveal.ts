"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal `step` more already-loaded items whenever the returned `sentinel` scrolls
 * near the viewport — no button, no spinner. `rootMargin` is generous so the next
 * batch is on screen before the user reaches the end. `resetKey` snaps back to the
 * first page when the underlying list changes (new search, new filter).
 */
export function useInfiniteReveal(total: number, step = 6, resetKey: unknown = null) {
  const [visible, setVisible] = useState(step);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisible(step);
  }, [resetKey, step]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || visible >= total) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((v) => Math.min(v + step, total));
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, total, step]);

  return { visible: Math.min(visible, total), sentinel, more: visible < total };
}
