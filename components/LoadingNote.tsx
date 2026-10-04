"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A line that keeps the traveller company through a wait that runs long: nothing for the first moments (most searches
 * are quicker than a sentence), then what is really being done, one thing after another, and a plain thank-you at the
 * end. Each line is true of the work; none promises it is nearly done.
 */
export function LoadingNote({ busy, messages, className }: { busy: boolean; messages: readonly string[]; className?: string }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(-1);
  useEffect(() => {
    if (!busy) {
      setStep(-1);
      return;
    }
    const first = setTimeout(() => setStep(0), 1800);
    const next = setInterval(() => setStep((s) => (s < 0 ? s : Math.min(s + 1, messages.length - 1))), 3600);
    return () => {
      clearTimeout(first);
      clearInterval(next);
    };
  }, [busy, messages.length]);
  const text = busy && step >= 0 ? messages[step] : null;
  // The row opens and closes with its own height, so the bar it sits in never jumps. `-mt-3` takes back the gap a
  // `space-y-3` parent leaves above it, and the padding inside gives it back while the line is showing.
  return (
    <AnimatePresence initial={false}>
      {text && (
        <motion.div
          key="note"
          aria-hidden
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduce ? undefined : { height: 0, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className={cn("-mt-3 overflow-hidden", className)}
        >
          <div className="pt-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={text}
                initial={reduce ? false : { opacity: 0, y: 4, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduce ? undefined : { opacity: 0, y: -4, filter: "blur(3px)" }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="shimmer-text text-xs"
              >
                {text}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The wording per kind of search, so the same wait reads the same wherever it happens. */
export const SEARCH_NOTES = {
  flights: ["Checking the airlines…", "Comparing prices…", "Finding the best fares…", "Still searching, thanks for waiting."],
  roundTrip: ["Pricing the round trip…", "Comparing airlines…", "Finding the best price…", "Still searching, thanks for waiting."],
  stays: ["Checking availability…", "Comparing prices across sites…", "Finding the best rates…", "Still searching, thanks for waiting."],
} as const;
