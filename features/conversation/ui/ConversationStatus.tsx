"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ease, motionTokens } from "@/components/motion-primitives";
import { RoamMark } from "@/features/roam/ui/RoamMark";

// The line follows what the server is really doing (see `progressFrame` in the AI route):
//   resolve  — working out what you asked
//   retrieve — the look-ups RESOLVE planned, one line each and the place or route in it ("Finding places in Ibiza…",
//              "Seeing what's on…", "Plotting the route Madrid to Lisbon…"), cycling while they run in parallel
//   decide   — the answer is being worked out ("Deciding what fits you…")
//   compose  — "Planning your days…" / "Working out the costs…" while a plan or budget is built, else "Putting it together…"
// Roam's voice: a travel companion thinking out loud. Short, concrete, no jargon, and never a promise it might not keep
// ("Almost there" on a slow turn is a small lie). A slow turn keeps its specific line and says so, rather than going generic.
const GENERIC = {
  resolve: ["Thinking it through…", "Working out what to look for…"],
  retrieve: ["Looking into it…"],
  decide: ["Deciding what fits you…"],
  compose: ["Putting it together…"],
} as const;

const TYPING_MARK = ["thinking", "searching", "planning", "answering"] as const;
const STAGE_PHASE: Record<"resolve" | "retrieve" | "decide" | "compose", number> = { resolve: 0, retrieve: 1, decide: 2, compose: 3 };
const STEP_MS = 2400;
const SLOW_MS = 20000;

const sentence = (line: string) => `${line[0]!.toUpperCase()}${line.slice(1)}…`;

export function Typing({ stage, label }: { stage?: "resolve" | "retrieve" | "decide" | "compose"; label?: string }) {
  const [tick, setTick] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  // One tick per step: the lines of a retrieve cycle, and the generic opening line gives way to its second one.
  useEffect(() => {
    setTick(0);
    const timer = setInterval(() => setTick((n) => n + 1), STEP_MS);
    return () => clearInterval(timer);
  }, [stage, label]);

  const current = stage ?? "resolve";
  const phase = STAGE_PHASE[current];
  const steps = label ? label.split("\n").filter(Boolean) : [];
  const generic = GENERIC[current];
  const line = steps.length ? sentence(steps[tick % steps.length]!) : generic[Math.min(tick, generic.length - 1)]!;
  const text = slow ? `Taking a little longer — ${line[0]!.toLowerCase()}${line.slice(1)}` : line;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={motionTokens.swap}
      className="flex items-center gap-1.5 px-1 py-2"
    >
      {/* Roam's path mark mirrors the real stage: branching while it works out what you asked,
          searching while it checks sources, folding routes into one while it composes. */}
      <RoamMark state={TYPING_MARK[phase]} size={32} className="text-foreground" />
      {/* The label follows the stage: the old one lifts away as the new one settles in. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={text}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.22, ease }}
          className="shimmer-text ml-1 text-xs"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

/** Roam's mark when a turn fails: the route breaks. Shown briefly under the log, then cleared
 *  by `ConversationSurface`. */
export function TurnOutcome({ kind }: { kind: "error" }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      className="flex items-center gap-1.5 px-1 py-2"
    >
      <RoamMark state={kind} size={32} className="text-foreground" />
      <span className="ml-1 text-xs text-muted-foreground">Roam couldn’t reply</span>
    </motion.div>
  );
}
