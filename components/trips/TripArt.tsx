"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A stable 32-bit hash, so a trip always gets the same artwork. */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * The ground under a trip's cover: a warm wash of the accent colour, answered by a faint lagoon haze
 * in the opposite corner, whose glow sits somewhere different for every trip, with an optional film grain (dark mode only: multiplied over white it reads as dirt). A photo or the type-led fallback goes on top.
 */
export function TripArt({
  seed,
  className,
  grain = false,
  vtName,
  children,
}: {
  seed: number;
  className?: string;
  grain?: boolean;
  /** Gives this surface a view-transition name, so another screen can morph into it (see lib/view-transition.ts). */
  vtName?: string;
  children?: ReactNode;
}) {
  const glowX = 12 + (seed % 70);
  const glowY = 6 + ((seed >> 8) % 44);
  const glow = 16 + ((seed >> 16) % 12);
  const style = {
    backgroundImage: [
      `radial-gradient(120% 95% at ${glowX}% ${glowY}%, color-mix(in oklab, var(--coral) ${glow}%, transparent), transparent 62%)`,
      // Coral's complement in the opposite corner: a warm dawn over a cool haze, never a grey smudge.
      `radial-gradient(90% 80% at ${100 - glowX}% 100%, color-mix(in oklab, var(--lagoon) 8%, transparent), transparent 68%)`,
    ].join(", "),
  } satisfies CSSProperties;
  const named: CSSProperties = vtName ? { ...style, viewTransitionName: vtName } : style;
  return (
    <div className={cn("relative isolate overflow-hidden bg-surface", className)} style={named} data-vt-name={vtName}>
      {grain && <div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 dark:opacity-[0.12] dark:mix-blend-screen" style={{ backgroundImage: GRAIN }} />}
      {children}
    </div>
  );
}
