"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/components/motion-primitives";

/**
 * Crossfades one state of a view into the next (a skeleton into its content, a grid into the digest). The leaving
 * state is lifted out of the flow and fades beneath the arriving one, so nothing is pushed down while it goes.
 * The parent must be `relative`.
 */
export function SwapView({ id, children }: { id: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div key={id} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={reduce ? { duration: 0 } : motionTokens.swap}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
