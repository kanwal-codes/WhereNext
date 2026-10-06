"use client";

import React, { createContext, useContext } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { RoamMark } from "./RoamMark";

/**
 * Roam's line icons: the same idea as `RoamMark` (one thin stroke that ends in a dot) drawn as the thing a widget is
 * about. Every icon is a single continuous line on a 64 grid with round caps, and the dot sits where the line arrives.
 *
 * In a live reply the icon draws itself once when it appears, dot last: that is the end of Roam's own line (see the
 * "handoff" state of `RoamMark`). Everywhere else (restored history, reduced motion) it is simply drawn.
 */
export const ROAM_ICONS = {
  star: { d: "M16.7 56.0 Q30.5 34.5 32.0 9.0 Q33.5 34.5 47.3 56.0 Q31.1 36.2 7.3 27.0 Q32.0 33.5 56.7 27.0 Q32.9 36.2 16.7 56.0", dot: [16.7, 56.0] },
  flights: { d: "M6 52 C18 52 20 34 30 34 C42 34 42 50 32 47 C20 43 26 22 44 18 C52 16 56 14 58 10", dot: [58, 10] },
  route: { d: "M8 56 C8 46 34 48 34 40 C34 31 10 34 10 25 C10 16 36 20 42 13 C46 8 52 8 56 10", dot: [56, 10] },
  budget: { d: "M44 16 C38 7 20 9 20 20 C20 32 44 28 44 41 C44 53 26 55 17 47", dot: [17, 47] },
  weather: { d: "M20 42 C6 42 6 26 20 26 C22 12 44 12 46 26 C60 26 60 42 46 42 L38 42 C30 42 30 50 36 54 C38 56 40 56 41 55", dot: [41, 55] },
  plan: { d: "M16 58 L17 8 C28 2 36 15 46 10 C50 8 53 11 54 15", dot: [54, 15] },
  checklist: { d: "M8 36 C14 36 21 43 25 52 C33 33 45 19 58 10", dot: [58, 10] },
  place: { d: "M32 58 C16 40 10 32 12 22 C14 10 30 4 42 10 C54 16 52 34 40 36 C31 38 25 29 32 24", dot: [32, 24] },
  compare: { d: "M32 32 C42 18 58 18 58 32 C58 46 42 46 32 32 C22 18 6 18 6 32 C6 46 22 46 32 32", dot: [32, 32] },
  update: { d: "M50 20 C44 10 30 6 20 12 C10 18 7 32 13 43 C19 54 35 57 46 49 C54 43 57 34 55 26", dot: [55, 26] },
  trip: { d: "M22 22 L24 15 C25 8 39 8 40 15 L42 22 C52 22 54 25 54 36 C54 48 52 54 44 54 L20 54 C12 54 10 48 10 36 C10 25 12 22 22 22", dot: [22, 22] },
  search: { d: "M56 56 L43 43 C35 50 20 47 16 35 C12 23 24 12 35 16 C44 19 46 30 38 34 C33 36 29 31 32 27", dot: [32, 27] },
  stay: { d: "M46 8 C26 10 14 28 22 44 C28 56 46 58 56 48 C40 50 32 38 36 26 C38 20 42 14 46 8", dot: [52, 20] },
  event: { d: "M24 52 C24 59 11 59 11 50 C11 43 22 41 24 47 L24 12 C31 18 45 17 50 28 C52 33 49 37 44 37", dot: [44, 37] },
} as const;

export type RoamIconName = keyof typeof ROAM_ICONS;

/** True inside a reply that has just arrived (not restored history): its icons draw themselves in. */
export const LiveReplyContext = createContext(false);

/** True for the first widget of a live reply: its chip plays the handoff (Roam's line erases into the icon). */
export const HandoffContext = createContext(false);

/** Seconds after the widget appears before its icon starts drawing: Roam's own line is erasing in that beat. */
const DRAW_DELAY = 0.18;
const DRAW_TIME = 0.62;

export function RoamIcon({ name, size = 24, className, draw, label, handoff }: { name: RoamIconName; size?: number; className?: string; /** Force drawing on or off; by default it draws only in a live reply. */ draw?: boolean; label?: string; /** Play Roam's line erasing into the icon; by default only the first widget of a live reply does. */ handoff?: boolean }) {
  const live = useContext(LiveReplyContext);
  const first = useContext(HandoffContext);
  const reduce = useReducedMotion();
  const animate = (draw ?? live) && !reduce;
  const withLine = animate && (handoff ?? first);
  const icon = ROAM_ICONS[name];
  // Keep the line thin like a drawn route, but never hairline at icon sizes (stroke is in 64-grid units).
  const sw = Math.max(2.6, (64 / size) * 1.15);
  const r = sw * 1.25;
  const svgEl = (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cn("shrink-0 overflow-visible", className)} data-roam-icon={name}>
      <motion.path
        d={icon.d}
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={animate ? { pathLength: { delay: DRAW_DELAY, duration: DRAW_TIME, ease: [0.65, 0, 0.35, 1] }, opacity: { delay: DRAW_DELAY, duration: 0.05 } } : { duration: 0 }}
      />
      <motion.circle
        cx={icon.dot[0]}
        cy={icon.dot[1]}
        r={r}
        fill="currentColor"
        initial={animate ? { scale: 0, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={animate ? { delay: DRAW_DELAY + DRAW_TIME - 0.08, type: "spring", stiffness: 420, damping: 16 } : { duration: 0 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </svg>
  );
  if (!withLine) return svgEl;
  // The first widget of a live reply: Roam's planned line erases (tail to dot) over the chip while the icon draws in.
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {svgEl}
      <span aria-hidden className="pointer-events-none absolute" style={{ left: -size * 0.18, top: size * 0.22 }}>
        <RoamMark state="handoff" size={size * 1.36} />
      </span>
    </span>
  );
}
