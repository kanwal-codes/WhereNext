"use client";

import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";
import { reveal } from "@/components/landing/story/scroll";

/**
 * Fades its content up as it scrolls into the window (see scroll.ts): by position, so it is never
 * late for a fast scroller and never replays for someone scrolling back. `offset` (px) staggers a
 * group: later items start a little further down the scroll.
 */
export function Reveal({ as: Tag = "div", offset = 0, className = "", style, children }: { as?: ElementType; offset?: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => (ref.current ? reveal(ref.current, offset) : undefined), [offset]);
  return (
    <Tag ref={ref} className={`rv ${className}`} style={style}>
      {children}
    </Tag>
  );
}
