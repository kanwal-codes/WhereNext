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
 * The ground under a trip's cover: a warm wash of the accent colour whose glow sits somewhere
 * different for every trip, with an optional film grain. A photo or the type-led fallback goes on top.
 */
export function TripArt({
  seed,
  className,
  grain = false,
  children,
}: {
  seed: number;
  className?: string;
  grain?: boolean;
  children?: ReactNode;
}) {
  const glowX = 12 + (seed % 70);
  const glowY = 6 + ((seed >> 8) % 44);
  const glow = 26 + ((seed >> 16) % 16);
  const style = {
    backgroundImage: [
      `radial-gradient(120% 95% at ${glowX}% ${glowY}%, color-mix(in oklab, var(--coral) ${glow}%, transparent), transparent 62%)`,
      "radial-gradient(90% 80% at 100% 100%, color-mix(in oklab, var(--foreground) 7%, transparent), transparent 70%)",
    ].join(", "),
  } satisfies CSSProperties;
  return (
    <div className={cn("relative isolate overflow-hidden bg-surface", className)} style={style}>
      {grain && <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.09] mix-blend-multiply dark:opacity-[0.12] dark:mix-blend-screen" style={{ backgroundImage: GRAIN }} />}
      {children}
    </div>
  );
}
