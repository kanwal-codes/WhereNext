"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { motionTokens } from "@/components/motion-primitives";

/** The bar that rises when there are unsaved changes (Discard or Save changes), and the "Saved" note that follows a save. */
export function SaveBar({ dirty, saving, saved, onDiscard, onSave, onSavedShown }: {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  onDiscard: () => void;
  onSave: () => void;
  /** The "Saved" note has had its moment. */
  onSavedShown: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <>
      <AnimatePresence>
        {dirty && (
          <motion.div initial={reduce ? false : { y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduce ? undefined : { y: 80, opacity: 0 }} transition={reduce ? { duration: 0 } : motionTokens.panelSpring} className="fixed inset-x-0 bottom-0 z-40 px-5 pb-5 sm:px-8">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-full border border-border bg-background/90 px-5 py-3 shadow-lift backdrop-blur-md">
              <p className="text-sm text-ink-soft">You have unsaved changes.</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={onDiscard} className="text-sm text-ink-soft hover:text-foreground">Discard</button>
                <button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-60">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save changes
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {saved && (
          <motion.div
            initial={reduce ? false : { y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.3 }}
            onAnimationComplete={() => setTimeout(onSavedShown, 1600)}
            className="fixed inset-x-0 bottom-6 z-40 flex justify-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-2 text-sm shadow-soft backdrop-blur-md">
              <Check className="h-4 w-4 text-coral" /> Saved
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
