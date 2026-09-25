"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import {
  animate,
  cubicBezier,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type Transition,
} from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Roam's one mark: a single thin route ending in a destination dot. It never swaps for a
 * different icon — the same route just behaves differently depending on what Roam is doing:
 *
 *   idle      — the wandering route breathes slowly
 *   thinking  — the route draws, then dotted side-trails branch off exploring options
 *   planning  — faint candidate routes converge into one clear line
 *   searching — a dot with a soft halo travels the route
 *   answering — the route extends forward, fading in from its tail, dot leading
 *   arrived   — the route settles and the destination dot glows
 *   settled   — the final, minimal route with its dot
 *   error     — the route breaks into fragments, hesitates, then reconnects
 *
 * Drawn in `currentColor` on a 2:1 canvas; `size` is the rendered width.
 */
export type RoamMarkState = "idle" | "thinking" | "planning" | "searching" | "answering" | "arrived" | "settled" | "error";

// The signature route: sets off, arches back on itself, then heads out to the destination.
const MARK = "M8 27 C14 27 20 9 29 9 C35 9 36 15 33 20 C30 26 31 32 39 32 C48 32 58 24 65 16.5";
const MARK_BREATHE = "M8 27.5 C14 27.5 20 7.5 29 7.5 C36 7.5 37 14.5 33.5 20 C30.5 25.5 31.5 32.5 39.5 32.5 C48.5 32.5 58 24 65 16.5";
const MARK_END = [65, 16.5] as const;

// The calm route, for answering / searching / arriving.
const WAVE = "M6 31 C14.5 31 20.5 18 29.5 18 C37.5 18 40.5 21.5 47.5 21 C55.5 20.5 62 17 70 13";
const WAVE_END = [70, 13] as const;

// Thinking: the route plus side-trails it explores.
const THINK_MAIN = "M6 36 C14 36 22 21 32 21.5 C40 22 42 33 49 33 C53 33 55 28 57 24";
const THINK_BRANCHES = [
  "M25 24 C29 18 34 10 31 4 C29 1 24 3 20 9",
  "M34 21.5 C42 19 46 6 62 3",
  "M57 24 C61 18 67 15 74 15",
  "M48 33 C52 33.5 55 35.5 57 38",
];
const THINK_END = [74, 15] as const;

// Planning: candidate routes that fold into one line before it heads to the destination.
const PLAN_MAIN = "M4 22 C10 22 14 14 20 14 C27 14 30 23 38 23 C46 23 50 24 56 25 C62 26 68 26 74 26";
const PLAN_MAIN_FRONT = "M4 22 C10 22 14 14 20 14 C27 14 30 23 38 23 C46 23 50 24 56 25";
const PLAN_ALTERNATES = [
  "M4 13 C10 13 14 6 20 6 C28 6 32 20 42 22 C48 23.5 52 25 56 25",
  "M10 25 C16 25 18 22 24 23 C32 24.5 36 27 44 26.5 C50 26 53 25.5 56 25",
  "M4 34 C10 34 14 29 20 30 C26 31 30 40 38 38 C46 36 50 27 56 25",
];
const PLAN_END = [74, 26] as const;

// Error: the route, split into fragments that part and rejoin. [start, end] as path fractions.
const ERROR_ROUTE = "M7 32 C12 32 16 24 20 18 C26 10 38 8 46 13 C52 17 56 23 62 23 C68 23 71 18 74 12";
const ERROR_END = [74, 12] as const;
// Joined fragments overlap slightly so no antialiasing seam shows once the route reconnects.
const ERROR_JOINED = [[0, 0.28], [0.26, 0.37], [0.35, 0.49], [0.47, 0.66], [0.64, 1]] as const;
const ERROR_BROKEN = [[0, 0.22], [0.3, 0.315], [0.4, 0.43], [0.52, 0.61], [0.68, 1]] as const;

const ease = [0.65, 0, 0.35, 1] as const;
const easeFn = cubicBezier(...ease);

export function RoamMark({
  state = "idle",
  size = 40,
  animated = true,
  className,
  label,
}: {
  state?: RoamMarkState;
  /** Rendered width in px; the mark is twice as wide as it is tall. */
  size?: number;
  /** false renders the state's resting pose — for places where motion would distract. */
  animated?: boolean;
  className?: string;
  /** Accessible name; omit when the mark is decorative next to visible text. */
  label?: string;
}) {
  const reduceMotion = useReducedMotion();
  const still = !animated || Boolean(reduceMotion);
  // Keep the line thin like a drawn route, but never hairline at icon sizes: stroke and dot are
  // sized in rendered px and converted back into the 80-unit canvas.
  const unit = 80 / size;
  const strokeWidth = Math.max(1.4, size * 0.02) * unit;
  const dotR = Math.max(2.2 * unit, 2.8);

  return (
    <svg
      viewBox="0 0 80 40"
      width={size}
      height={size / 2}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0 overflow-visible", className)}
      data-roam-state={state}
    >
      {/* `key` restarts each state's choreography cleanly instead of blending two loops. */}
      <State key={`${state}-${still}`} state={state} still={still} sw={strokeWidth} dotR={dotR} />
    </svg>
  );
}

type Draw = { still: boolean; sw: number; dotR: number };

function line(sw: number) {
  return { fill: "none", stroke: "currentColor", strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" } as const;
}

function Dot({ at, r }: { at: readonly [number, number]; r: number }) {
  return <circle cx={at[0]} cy={at[1]} r={r} fill="currentColor" />;
}

function State({ state, ...draw }: Draw & { state: RoamMarkState }) {
  switch (state) {
    case "idle":
      return <Idle {...draw} />;
    case "thinking":
      return <Thinking {...draw} />;
    case "planning":
      return <Planning {...draw} />;
    case "searching":
      return <Searching {...draw} />;
    case "answering":
      return <Answering {...draw} />;
    case "arrived":
      return <Arrived {...draw} />;
    case "settled":
      return (
        <>
          <path d={WAVE} {...line(draw.sw)} />
          <Dot at={WAVE_END} r={draw.dotR} />
        </>
      );
    case "error":
      return <Broken {...draw} />;
  }
}

function Idle({ still, sw, dotR }: Draw) {
  return (
    <>
      <motion.path
        {...line(sw)}
        initial={{ d: MARK }}
        animate={still ? { d: MARK } : { d: [MARK, MARK_BREATHE] }}
        transition={still ? { duration: 0 } : { duration: 3.2, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }}
      />
      <Dot at={MARK_END} r={dotR} />
    </>
  );
}

function Thinking({ still, sw, dotR }: Draw) {
  const id = useId();
  const cycle = { duration: 4, repeat: Infinity, ease } as const;
  return (
    <>
      <motion.path
        d={THINK_MAIN}
        {...line(sw)}
        initial={still ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease }}
      />
      {THINK_BRANCHES.map((d, i) => {
        const maskId = `${id}-b${i}`;
        const delay = 0.5 + i * 0.35;
        return (
          <g key={d}>
            {/* Dotted trail revealed by a solid stroke drawing along it. */}
            <mask id={maskId} maskUnits="userSpaceOnUse" x="-10" y="-10" width="100" height="60">
              <motion.path
                d={d}
                fill="none"
                stroke="white"
                strokeWidth={sw * 2.5}
                strokeLinecap="round"
                initial={still ? false : { pathLength: 0, opacity: 0 }}
                animate={still ? { pathLength: 1, opacity: 1 } : { pathLength: [0, 1, 1], opacity: [0, 1, 1, 0] }}
                transition={
                  still
                    ? { duration: 0 }
                    : {
                        pathLength: { ...cycle, times: [0, 0.3, 1], delay },
                        // Hidden until it has length: a zero-length round cap would flash as a dot.
                        opacity: { ...cycle, times: [0, 0.02, 0.8, 1], delay },
                      }
                }
              />
            </mask>
            <path d={d} {...line(sw * 0.9)} strokeDasharray={`0.01 ${sw * 2.2}`} mask={`url(#${maskId})`} opacity={0.75} />
          </g>
        );
      })}
      <motion.circle
        cx={THINK_END[0]}
        cy={THINK_END[1]}
        r={dotR}
        fill="currentColor"
        initial={still ? false : { scale: 0, opacity: 0 }}
        animate={still ? { scale: 1, opacity: 1 } : { scale: [0, 0, 1, 1, 0.6], opacity: [0, 0, 1, 1, 0] }}
        transition={still ? { duration: 0 } : { ...cycle, times: [0, 0.3, 0.4, 0.8, 1], delay: 0.5 + 2 * 0.35 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </>
  );
}

function Planning({ still, sw, dotR }: Draw) {
  if (still) {
    return (
      <>
        {PLAN_ALTERNATES.map((d) => (
          <path key={d} d={d} {...line(sw * 0.85)} opacity={0.2} />
        ))}
        <path d={PLAN_MAIN} {...line(sw)} />
        <Dot at={PLAN_END} r={dotR} />
      </>
    );
  }
  // One 4.2s cycle: candidates sketch in, the chosen route draws over them, the candidates fold
  // into it, the destination appears, and everything clears for the next pass.
  const cycle = { duration: 4.2, repeat: Infinity, ease } as const;
  return (
    <>
      {PLAN_ALTERNATES.map((d, i) => (
        <motion.path
          key={d}
          {...line(sw * 0.85)}
          initial={{ d, pathLength: 0, opacity: 0 }}
          animate={{ d: [d, d, d, PLAN_MAIN_FRONT, PLAN_MAIN_FRONT], pathLength: [0, 1, 1, 1, 1], opacity: [0, 0.22, 0.22, 0, 0] }}
          transition={{
            d: { ...cycle, times: [0, 0.3, 0.45, 0.7, 1] },
            pathLength: { ...cycle, times: [0, 0.3, 0.45, 0.7, 1], delay: i * 0.1 },
            opacity: { ...cycle, times: [0, 0.04, 0.45, 0.7, 1], delay: i * 0.1 },
          }}
        />
      ))}
      <motion.path
        d={PLAN_MAIN}
        {...line(sw)}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: [0, 0, 1, 1, 1], opacity: [0, 0, 1, 1, 0] }}
        transition={{
          pathLength: { ...cycle, times: [0, 0.2, 0.62, 0.95, 1] },
          opacity: { ...cycle, times: [0, 0.2, 0.22, 0.92, 1] },
        }}
      />
      <motion.circle
        cx={PLAN_END[0]}
        cy={PLAN_END[1]}
        r={dotR}
        fill="currentColor"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 0, 1, 1, 0] }}
        transition={{ ...cycle, times: [0, 0.6, 0.68, 0.92, 1] }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </>
  );
}

/** Loops a 0→1 clock for choreographies that need to read a path position each frame. */
function useClock(still: boolean, duration: number, repeatType: "loop" | "mirror" = "loop", restAt = 1) {
  const t = useMotionValue(still ? restAt : 0);
  useEffect(() => {
    if (still) return;
    const controls = animate(t, [0, 1], { duration, ease: "linear", repeat: Infinity, repeatType });
    return () => controls.stop();
  }, [still, t, duration, repeatType]);
  return t;
}

/** Tracks the point `progress` (0→1) of the way along a path, as cx/cy motion values. */
function usePointAlong(pathRef: RefObject<SVGPathElement | null>, progress: MotionValue<number>, fallback: readonly [number, number]) {
  const cx = useMotionValue<number>(fallback[0]);
  const cy = useMotionValue<number>(fallback[1]);
  const place = (v: number) => {
    const path = pathRef.current;
    if (!path || typeof path.getTotalLength !== "function") return;
    const point = path.getPointAtLength(Math.min(Math.max(v, 0), 1) * path.getTotalLength());
    cx.set(point.x);
    cy.set(point.y);
  };
  useMotionValueEvent(progress, "change", place);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- place once the path has mounted
  useEffect(() => place(progress.get()), []);
  return { cx, cy };
}

function Answering({ still, sw, dotR }: Draw) {
  const id = useId();
  const pathRef = useRef<SVGPathElement>(null);
  const t = useClock(still, 2.6, "loop", 0.7);
  const progress = useTransform(t, [0, 0.65, 1], [0, 1, 1], { ease: [easeFn, easeFn] });
  const opacity = useTransform(t, [0, 0.03, 0.88, 1], [0, 1, 1, 0]);
  // The leading dot grows in with the route so it never sits alone at the start.
  const dotScale = useTransform(progress, [0, 0.2], [0.3, 1]);
  const { cx, cy } = usePointAlong(pathRef, progress, WAVE_END);
  const gradientId = `${id}-tail`;
  return (
    <motion.g style={{ opacity }}>
      <defs>
        {/* The tail fades out behind the leading edge, like the route is being revealed. */}
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="6" y1="0" x2="28" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>
      <motion.path ref={pathRef} d={WAVE} {...line(sw)} stroke={`url(#${gradientId})`} style={{ pathLength: progress }} />
      <motion.circle cx={cx} cy={cy} r={dotR} fill="currentColor" style={{ scale: dotScale, transformBox: "fill-box", transformOrigin: "center" }} />
    </motion.g>
  );
}

function Searching({ still, sw, dotR }: Draw) {
  const pathRef = useRef<SVGPathElement>(null);
  const t = useClock(still, 2.4, "mirror", 0.4);
  const progress = useTransform(t, [0, 1], [0.12, 0.82], { ease: cubicBezier(0.45, 0, 0.55, 1) });
  const { cx, cy } = usePointAlong(pathRef, progress, WAVE_END);
  return (
    <>
      <path ref={pathRef} d={WAVE} {...line(sw)} />
      <Dot at={WAVE_END} r={dotR * 0.8} />
      <motion.circle cx={cx} cy={cy} r={dotR * 2.6} fill="currentColor" opacity={0.08} />
      <motion.circle cx={cx} cy={cy} r={dotR} fill="currentColor" />
    </>
  );
}

function Arrived({ still, sw, dotR }: Draw) {
  return (
    <>
      <motion.path
        d={WAVE}
        {...line(sw)}
        initial={still ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease }}
      />
      <Halo at={WAVE_END} r={dotR * 2.8} still={still} delay={0.9} />
      <motion.circle
        cx={WAVE_END[0]}
        cy={WAVE_END[1]}
        r={dotR}
        fill="currentColor"
        initial={still ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.85, type: "spring", stiffness: 420, damping: 16 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </>
  );
}

function Halo({ at, r, still, delay }: { at: readonly [number, number]; r: number; still: boolean; delay: number }): ReactNode {
  return (
    <motion.circle
      cx={at[0]}
      cy={at[1]}
      r={r}
      fill="currentColor"
      initial={still ? false : { scale: 0.4, opacity: 0 }}
      animate={still ? { scale: 1, opacity: 0.09 } : { scale: [0.4, 1, 0.88, 1], opacity: [0, 0.1, 0.07, 0.1] }}
      transition={still ? { duration: 0 } : { delay, duration: 2.4, times: [0, 0.3, 0.65, 1], ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
    />
  );
}

function Broken({ still, sw, dotR }: Draw) {
  const cycle: Transition = { duration: 3, repeat: Infinity, ease, times: [0, 0.22, 0.6, 0.82, 1] };
  return (
    <>
      {ERROR_JOINED.map(([a, b], i) => {
        const [c, d] = ERROR_BROKEN[i]!;
        return (
          <motion.path
            key={i}
            d={ERROR_ROUTE}
            {...line(sw)}
            initial={still ? false : { pathOffset: a, pathLength: b - a }}
            animate={still ? { pathOffset: c, pathLength: d - c } : { pathOffset: [a, c, c, a, a], pathLength: [b - a, d - c, d - c, b - a, b - a] }}
            transition={still ? { duration: 0 } : cycle}
          />
        );
      })}
      <Dot at={ERROR_END} r={dotR} />
    </>
  );
}
