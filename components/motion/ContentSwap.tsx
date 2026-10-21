"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { motionTokens } from "@/components/motion/tokens";

/**
 * Crossfade one keyed view into the next inside a surface that itself stays put.
 * `key` change → old fades/slides out, new fades/slides in. Reduced-motion → instant.
 */
export function ContentSwap({
  swapKey,
  className,
  children,
}: {
  swapKey: string;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={swapKey}
        className={className}
        initial={reduce ? false : { opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={reduce ? undefined : { opacity: 0, x: -6 }}
        transition={reduce ? { duration: 0 } : motionTokens.swap}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
