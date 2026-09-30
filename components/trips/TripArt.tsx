"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
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

// Three gentle routes from a start dot (left) to a destination dot (right). Every trip is a path,
// the same idea as Roam's own mark, so the cards read as one family.
const ROUTES = [
  "M14 66 C48 66 60 26 100 34 C138 42 128 72 168 60 C196 52 208 30 226 22",
  "M14 42 C44 18 84 20 104 44 C124 68 160 74 186 52 C204 38 214 30 226 26",
  "M14 60 C40 60 52 36 84 36 C122 36 118 68 152 64 C186 60 196 34 226 30",
];
const ROUTE_ENDS = [
  [226, 22],
  [226, 26],
  [226, 30],
] as const;
const ROUTE_STARTS = [
  [14, 66],
  [14, 42],
  [14, 60],
] as const;

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** The route line and its two dots. Draws itself in once, the first time it scrolls into view. */
export function TripRoute({ seed, className }: { seed: number; className?: string }) {
  const reduce = useReducedMotion();
  const variant = seed % ROUTES.length;
  const [sx, sy] = ROUTE_STARTS[variant]!;
  const [ex, ey] = ROUTE_ENDS[variant]!;
  const draw = reduce
    ? {}
    : {
        initial: { pathLength: 0, opacity: 0 },
        whileInView: { pathLength: 1, opacity: 1 },
        viewport: { once: true, margin: "-10% 0px" },
        transition: { duration: 1.5, ease: [0.22, 0.61, 0.36, 1] as const, delay: (seed % 5) * 0.06 },
      };
  const pop = reduce
    ? {}
    : {
        initial: { scale: 0, opacity: 0 },
        whileInView: { scale: 1, opacity: 1 },
        viewport: { once: true, margin: "-10% 0px" },
        transition: { type: "spring" as const, stiffness: 320, damping: 18, delay: 1.1 + (seed % 5) * 0.06 },
      };
  return (
    <svg aria-hidden viewBox="0 0 240 90" preserveAspectRatio="xMidYMid meet" className={cn("absolute inset-0 h-full w-full overflow-visible px-6 py-4 text-foreground", className)}>
      {/* The road not taken: a fainter dotted line behind the real one gives it some depth. */}
      <path d={ROUTES[(variant + 1) % ROUTES.length]} fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeDasharray="1 5" opacity={0.28} />
      <motion.path d={ROUTES[variant]} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...draw} />
      <circle cx={sx} cy={sy} r={3} fill="var(--card)" stroke="currentColor" strokeWidth={1.5} />
      <motion.g style={{ transformBox: "fill-box", transformOrigin: "center" }} {...pop}>
        <circle cx={ex} cy={ey} r={9} fill="var(--coral)" opacity={0.2} />
        <circle cx={ex} cy={ey} r={4.5} fill="var(--coral)" />
      </motion.g>
    </svg>
  );
}

/**
 * The picture at the top of a trip: no photo needed, just a warm wash of the accent colour whose
 * glow sits somewhere different for every trip, an optional film grain, and the route line.
 */
export function TripArt({
  seed,
  className,
  grain = false,
  route = true,
  children,
}: {
  seed: number;
  className?: string;
  grain?: boolean;
  route?: boolean;
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
      {route && <TripRoute seed={seed} />}
      {children}
    </div>
  );
}
