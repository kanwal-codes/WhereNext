"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ease, motionTokens } from "@/components/motion-primitives";
import { RoamMark } from "@/features/roam/ui/RoamMark";

// Phase 2.6.2 (docs/overhaul/roadmap/phase-2-speed.md): the first three labels now track real
// backend milestones (RESOLVE started / RETRIEVE started / COMPOSE started — see `progressStage`,
// driven by streamAssistantResponse's `onProgress`), not a fixed-timer guess. The last two stay
// timer-driven: once COMPOSE starts there's no finer server-side signal until its first token
// arrives, so these are a fallback ceiling for a turn that's still genuinely slow at that point —
// `Math.max` in `Typing` below means they only ever ADVANCE the label past wherever the real
// stage already put it, never regress it back to a stale-sounding one.
// index 1 ("Looking into it…") is itself a fallback now — `Typing` swaps it for
// `progressLabel` ("Finding places…", "Plotting the route…") whenever RESOLVE planned a tool
// this session recognizes, so the wait names what's actually happening instead of staying generic.
// Roam's voice while it works: a travel companion thinking out loud. Short, concrete, no jargon
// ("live sources"), and never a promise it might not keep ("Almost there" on a slow turn is a small
// lie). The long-wait line is honest instead of apologetic.
const THINKING_STATES = [
  "Thinking it through…",
  "Looking into it…",
  "Putting it together…",
  "Still on it…",
  "This one’s taking a little longer…",
];

const TYPING_MARK = ["thinking", "searching", "planning", "answering"] as const;

const STAGE_PHASE: Record<"resolve" | "retrieve" | "compose", number> = { resolve: 0, retrieve: 1, compose: 2 };

export function Typing({ stage, label }: { stage?: "resolve" | "retrieve" | "compose"; label?: string }) {
  const [timerPhase, setTimerPhase] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setTimerPhase(3), 11000),
      setTimeout(() => setTimerPhase(4), 20000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);
  const phase = Math.max(stage ? STAGE_PHASE[stage] : 0, timerPhase);
  // `label` names what RESOLVE actually planned ("checking places") — only meaningful while
  // "retrieve" is still the current phase; once the timer or a later stage has moved past it,
  // the phase-indexed generic text below takes back over rather than a now-stale activity name.
  const text = label && phase === STAGE_PHASE.retrieve ? `${label[0]!.toUpperCase()}${label.slice(1)}…` : THINKING_STATES[phase];
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
      <RoamMark state={TYPING_MARK[Math.min(phase, TYPING_MARK.length - 1)]} size={32} className="text-foreground" />
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
