"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One line that never wraps: when the text is wider than the room it has, the type shrinks (down to `min` of its size)
 * until it fits. For prices and big figures, where "CA$812.40" must not break into "CA$812.4" and "0". Size it with a class on
 * this element; the shrink is a font-size ratio, so everything inside scales together.
 */
export function FitText({ children, className, min = 0.6 }: { children: ReactNode; className?: string; /** The smallest it may become, as a share of its set size. */ min?: number }) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      i.style.fontSize = "";
      const room = o.clientWidth;
      const need = i.scrollWidth;
      if (room > 0 && need > room) i.style.fontSize = `${Math.max(min, room / need)}em`;
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(o);
    return () => watch.disconnect();
  }, [children, min]);
  return (
    <span ref={outer} className={cn("block max-w-full min-w-0", className)}>
      <span ref={inner} className="inline-block whitespace-nowrap">{children}</span>
    </span>
  );
}
