"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ReactNode } from "react";
import { TripPanel } from "@/components/TripPanel";
import { motionTokens } from "@/components/motion-primitives";

/** The right-hand column on a wide screen: a detail panel, the trip context, or the context's slim rail, crossfading in place. */
export function SidePane({ panel, showContext, setContextCollapsed, contextRail }: { panel: boolean; showContext: boolean; setContextCollapsed: (collapsed: boolean) => void; contextRail: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative h-full min-h-0 overflow-hidden border-l border-border bg-surface">
      {/* Crossfade in place: the panel, the context rail and its collapsed strip stack in one box, so one
          leaving while another arrives never leaves a blank beat. The panel keeps ONE key across subjects:
          TripPanel's own surface stays put and only its content swaps (a per-subject key used to slide the
          whole panel out and back for every change, on top of that swap). */}
      <AnimatePresence initial={false}>
        {panel ? (
          <motion.div
            key="panel"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, pointerEvents: "none" }}
            transition={reduceMotion ? { duration: 0 } : motionTokens.swap}
            className="absolute inset-0"
          >
            <TripPanel layout="inline" />
          </motion.div>
        ) : showContext ? (
          <motion.div
            key="trip-context"
            // Opacity-only: an `x` slide here leaves a lingering `transform` on the
            // scrollable div's ancestor, which forces GPU compositing on this whole panel and makes a
            // slow scroll inside it visibly juddery — live-caught on the trip-context rail.
            // min-w = the settled column width, so while the column animates open the text stays put
            // behind the clip instead of wrapping a letter per line.
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, pointerEvents: "none" }}
            transition={reduceMotion ? { duration: 0 } : motionTokens.swap}
            className="absolute inset-0 flex min-w-[340px] flex-col overflow-hidden"
          >
            <div className="flex shrink-0 justify-start px-2 pt-3">
              <button
                type="button"
                onClick={() => setContextCollapsed(true)}
                aria-label="Hide trip context"
                title="Hide trip context"
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-[background-color,color,transform] hover:bg-muted hover:text-foreground active:scale-95"
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim px-4 pb-5">{contextRail}</div>
          </motion.div>
        ) : (
          <motion.div
            key="trip-context-rail"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, pointerEvents: "none" }}
            transition={reduceMotion ? { duration: 0 } : motionTokens.swap}
            className="absolute inset-0 flex flex-col items-center pt-3"
          >
            <button
              type="button"
              onClick={() => setContextCollapsed(false)}
              aria-label="Show trip context"
              title="Show trip context"
              className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-background/60 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
