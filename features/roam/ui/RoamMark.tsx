"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Roam's one mark: a single route that sets off, loops once (the wander), and heads out.
 * It never swaps for a different icon — the same route just behaves differently:
 *
 *   idle      — the route at rest
 *   thinking  — a stroke travels the faint route back and forth, looping as it searches
 *   planning  — candidate routes sketch in beside it, then fade as the real one takes shape
 *   answering — the route keeps drawing itself forward, leading the way
 *   arrived   — the route draws in once and settles on a destination dot
 *   error     — the route parts in the middle, hesitates, then rejoins
 *
 * Everything animates along the fixed route (draw / travel / fade) rather than bending it,
 * so the mark stays recognisable in every state. Drawn in `currentColor`.
 */
export type RoamMarkState = "idle" | "thinking" | "planning" | "answering" | "arrived" | "error";

const ROUTE = "M6 38 C18 38 31 33 31 22 C31 13 20 13 20 20 C20 29 34 30 42 10";
// The route split where it enters the loop, for the "error" break.
const ROUTE_IN = "M6 38 C18 38 31 33 31 22";
const ROUTE_OUT = "M31 22 C31 13 20 13 20 20 C20 29 34 30 42 10";
// Candidate routes for "planning": same origin and destination, no wander.
const ALTERNATES = ["M6 38 C10 22 26 12 42 10", "M6 38 C24 40 40 30 42 10"];

const ease = [0.65, 0, 0.35, 1] as const;
const TRACE_OPACITY = 0.14;

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
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" } as const;

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
      {/* `key={state}` restarts each state's animation cleanly instead of blending two loops. */}
      <g key={state}>{still ? <Resting state={state} stroke={stroke} /> : <Moving state={state} stroke={stroke} />}</g>
    </svg>
  );
}

type Stroke = Record<string, string | number>;

function Resting({ state, stroke }: { state: RoamMarkState; stroke: Stroke }) {
  if (state === "error") {
    return (
      <>
        <motion.path d={ROUTE_IN} {...stroke} initial={false} animate={{ pathLength: 0.7 }} />
        <motion.path d={ROUTE_OUT} {...stroke} opacity={0.4} initial={false} animate={{ pathOffset: 0.16, pathLength: 0.84 }} />
      </>
    );
  }
  return (
    <>
      <path d={ROUTE} {...stroke} />
      {state === "arrived" && <circle cx={42} cy={10} r={4} fill="currentColor" />}
    </>
  );
}

function Moving({ state, stroke }: { state: RoamMarkState; stroke: Stroke }) {
  const trace = <path d={ROUTE} {...stroke} opacity={TRACE_OPACITY} />;

  switch (state) {
    case "idle":
      return (
        <motion.path
          d={ROUTE}
          {...stroke}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease }}
        />
      );

    case "thinking":
      return (
        <>
          {trace}
          <motion.path
            d={ROUTE}
            {...stroke}
            initial={{ pathLength: 0.28, pathOffset: 0 }}
            animate={{ pathLength: [0.28, 0.4, 0.28], pathOffset: [0, 0.3, 0.72] }}
            transition={{ duration: 1.6, ease, repeat: Infinity, repeatType: "reverse" }}
          />
        </>
      );

    case "planning": {
      // Per-property timing: a stroke is only made visible once it has length, so the
      // round caps never flash as dots at the route's ends.
      const cycle = { duration: 3.2, repeat: Infinity, ease };
      return (
        <>
          {trace}
          {ALTERNATES.map((d, i) => (
            <motion.path
              key={d}
              d={d}
              {...stroke}
              strokeWidth={2}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 1], opacity: [0, 0.4, 0.4, 0, 0] }}
              transition={{
                pathLength: { ...cycle, times: [0, 0.35, 1], delay: i * 0.12 },
                opacity: { ...cycle, times: [0, 0.03, 0.55, 0.8, 1], delay: i * 0.12 },
              }}
            />
          ))}
          <motion.path
            d={ROUTE}
            {...stroke}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: [0, 0, 1, 1], opacity: [0, 0, 1, 1, 0] }}
            transition={{
              pathLength: { ...cycle, times: [0, 0.25, 0.6, 1] },
              opacity: { ...cycle, times: [0, 0.25, 0.27, 0.9, 1] },
            }}
          />
        </>
      );
    }

    case "answering": {
      const cycle = { duration: 2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.1 } as const;
      return (
        <>
          {trace}
          <motion.path
            d={ROUTE}
            {...stroke}
            initial={{ pathLength: 0, pathOffset: 0, opacity: 0 }}
            animate={{ pathLength: [0, 1, 0], pathOffset: [0, 0, 1], opacity: [0, 1, 1, 0] }}
            transition={{
              pathLength: { ...cycle, times: [0, 0.55, 1] },
              pathOffset: { ...cycle, times: [0, 0.55, 1] },
              opacity: { ...cycle, ease: "linear", times: [0, 0.03, 0.97, 1] },
            }}
          />
        </>
      );
    }

    case "arrived":
      return (
        <>
          <motion.path
            d={ROUTE}
            {...stroke}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease }}
          />
          <motion.circle
            cx={42}
            cy={10}
            r={4}
            fill="currentColor"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.8, type: "spring", stiffness: 420, damping: 16 }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        </>
      );

    case "error": {
      const wobble: Transition = { duration: 2.6, ease, repeat: Infinity, times: [0, 0.2, 0.6, 0.8, 1] };
      return (
        <>
          <motion.path
            d={ROUTE_IN}
            {...stroke}
            initial={{ pathLength: 1 }}
            animate={{ pathLength: [1, 0.7, 0.7, 1, 1] }}
            transition={wobble}
          />
          <motion.path
            d={ROUTE_OUT}
            {...stroke}
            initial={{ pathOffset: 0, pathLength: 1, opacity: 1 }}
            animate={{ pathOffset: [0, 0.16, 0.16, 0, 0], pathLength: [1, 0.84, 0.84, 1, 1], opacity: [1, 0.4, 0.4, 1, 1] }}
            transition={wobble}
          />
        </>
      );
    }
  }
}
