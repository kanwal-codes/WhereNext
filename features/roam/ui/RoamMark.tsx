"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Roam's one mark: a single flowing path. It never swaps for a different icon — the same
 * route just behaves differently depending on what Roam is doing.
 *
 *   idle      — a calm route that breathes gently
 *   thinking  — the route wanders while a side trail branches off, searching
 *   planning  — several candidate routes fan out, then fold back into one
 *   answering — the route reveals itself forward, leading the way
 *   arrived   — the route settles and ends in a destination dot
 *   error     — the route breaks, hesitates, then reconnects
 *
 * Drawn in `currentColor`, so it inherits text colour (black on white in light mode).
 * Every `d` below shares the same command shape (M + C + S) so motion can morph between them.
 */
export type RoamMarkState = "idle" | "thinking" | "planning" | "answering" | "arrived" | "error";

const ROUTE = "M8 38 C16 38 15 25 24 24 S32 10 40 10";
const ROUTE_BREATHE = "M8 37 C17 39 14 26 24 24 S31 11 40 11";
const WANDER = [ROUTE, "M8 38 C12 30 20 32 24 24 S36 14 40 10", "M8 38 C18 42 10 22 24 24 S28 8 40 10", ROUTE];
const BRANCH = "M24 24 S30 30 38 30";
const BRANCH_ALT = "M24 24 S20 12 14 10";
const ALT_HIGH = "M8 38 C8 26 18 16 24 14 S34 10 40 10";
const ALT_LOW = "M8 38 C20 40 30 34 34 24 S38 14 40 10";
// The route split at its midpoint, for the "error" break.
const FIRST_HALF = "M8 38 C16 38 15 25 24 24";
const SECOND_HALF = "M24 24 C28 23.5 32 10 40 10";

const ease = [0.45, 0, 0.2, 1] as const;
const loop = (duration: number, extra?: Transition): Transition => ({ duration, ease, repeat: Infinity, ...extra });

export function RoamMark({
  state = "idle",
  size = 20,
  animated = true,
  className,
  label,
}: {
  state?: RoamMarkState;
  size?: number;
  /** false renders the state's resting pose — for places where motion would distract. */
  animated?: boolean;
  className?: string;
  /** Accessible name; omit when the mark is decorative next to visible text. */
  label?: string;
}) {
  const reduceMotion = useReducedMotion();
  const still = !animated || Boolean(reduceMotion);
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 3.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0 overflow-visible", className)}
      data-roam-state={state}
    >
      {state === "error" ? (
        <>
          <path d={FIRST_HALF} {...stroke} />
          <motion.path
            d={SECOND_HALF}
            {...stroke}
            initial={false}
            animate={still ? { x: 3, y: 2, opacity: 0.5 } : { x: [0, 3, 2, 3, 0], y: [0, 2, 3, 2, 0], opacity: [1, 0.45, 0.6, 0.45, 1] }}
            transition={still ? { duration: 0 } : loop(2.4, { times: [0, 0.2, 0.45, 0.7, 1], repeatDelay: 0.6 })}
          />
        </>
      ) : (
        <>
          {state === "thinking" && !still && (
            <motion.path
              {...stroke}
              strokeWidth={2.5}
              initial={{ d: BRANCH, pathLength: 0, opacity: 0 }}
              animate={{ d: [BRANCH, BRANCH, BRANCH_ALT, BRANCH_ALT], pathLength: [0, 1, 0, 1], opacity: [0, 0.5, 0, 0.5] }}
              transition={loop(3.2, { repeatType: "reverse" })}
            />
          )}
          {state === "planning" &&
            [ALT_HIGH, ALT_LOW].map((alt, i) => (
              <motion.path
                key={alt}
                {...stroke}
                strokeWidth={2.5}
                initial={{ d: ROUTE, opacity: 0 }}
                animate={still ? { d: alt, opacity: 0.3 } : { d: [ROUTE, alt, alt, ROUTE], opacity: [0, 0.4, 0.4, 0] }}
                transition={still ? { duration: 0 } : loop(2.8, { times: [0, 0.35, 0.65, 1], delay: i * 0.15, repeatDelay: 0.3 })}
              />
            ))}
          {state === "answering" && !still && <path d={ROUTE} {...stroke} opacity={0.2} />}
          <motion.path
            {...stroke}
            initial={false}
            animate={mainPose(state, still)}
            transition={mainTransition(state, still)}
          />
          {state === "arrived" && (
            <motion.circle
              cx={40}
              cy={10}
              r={4.5}
              fill="currentColor"
              initial={still ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: still ? 0 : 0.55, type: "spring", stiffness: 380, damping: 18 }}
              style={{ transformOrigin: "40px 10px" }}
            />
          )}
        </>
      )}
    </svg>
  );
}

function mainPose(state: Exclude<RoamMarkState, "error">, still: boolean) {
  if (still) return { d: ROUTE, pathLength: 1, opacity: 1 };
  switch (state) {
    case "idle":
      return { d: [ROUTE, ROUTE_BREATHE], pathLength: 1, opacity: 1 };
    case "thinking":
      return { d: WANDER, pathLength: 1, opacity: 1 };
    case "planning":
      return { d: ROUTE, pathLength: 1, opacity: [0.55, 1, 1, 0.55] };
    case "answering":
      return { d: ROUTE, pathLength: [0, 1, 1], opacity: [1, 1, 0] };
    case "arrived":
      return { d: ROUTE, pathLength: [0, 1], opacity: 1 };
  }
}

function mainTransition(state: Exclude<RoamMarkState, "error">, still: boolean): Transition {
  if (still) return { duration: 0.4, ease };
  switch (state) {
    case "idle":
      return loop(3, { repeatType: "mirror" });
    case "thinking":
      return loop(3.6);
    case "planning":
      return loop(2.8, { times: [0, 0.35, 0.65, 1], repeatDelay: 0.3 });
    case "answering":
      return loop(1.8, { times: [0, 0.75, 1], repeatDelay: 0.1 });
    case "arrived":
      return { duration: 0.7, ease };
  }
}
