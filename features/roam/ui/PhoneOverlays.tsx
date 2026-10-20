"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookOpen, ChevronRight, Users, X } from "lucide-react";
import type { ReactNode } from "react";
import { TripPanel } from "@/components/TripPanel";
import { Sheet, motionTokens } from "@/components/motion-primitives";
import { controlGhost } from "@/features/conversation/ui/blocks/ui";
import { PHONE_V2 } from "@/lib/phone-v2";

/** On a narrow screen: the detail panel (a sheet over a scrim, or a full screen), the group options sheet and the trip context sheet. */
export function PhoneOverlays({ tripId, panel, sheetPanel, closePanel, groupMenuOpen, setGroupMenuOpen, mobileContextOpen, setMobileContextOpen, contextRail }: {
  tripId: string;
  panel: boolean;
  sheetPanel: boolean;
  closePanel: () => void;
  groupMenuOpen: boolean;
  setGroupMenuOpen: (open: boolean) => void;
  mobileContextOpen: boolean;
  setMobileContextOpen: (open: boolean) => void;
  contextRail: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <>
      <AnimatePresence initial={false}>
        {panel && PHONE_V2 && sheetPanel && (
          // Phone redesign: a sheet over the conversation, not a screen that replaces it. The chat stays behind the scrim,
          // so closing the sheet puts you back exactly where you were reading.
          <motion.div key="panel-scrim" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduceMotion ? undefined : { opacity: 0 }} transition={reduceMotion ? { duration: 0 } : motionTokens.fast} onClick={closePanel} className="fixed inset-0 z-40 bg-black/40" />
        )}
        {panel && (
          <motion.div
            key="panel"
            // `transform` as a whole (not x / y): the browser runs it on the compositor, so the slide keeps its pace while the page works.
            initial={reduceMotion ? false : { transform: "translateY(100%)" }}
            animate={{ transform: "translateY(0%)" }}
            exit={reduceMotion ? undefined : { transform: "translateY(100%)" }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className={PHONE_V2 && sheetPanel ? "fixed inset-x-0 top-[max(3.25rem,calc(env(safe-area-inset-top)+2.5rem))] bottom-0 z-40 overflow-hidden rounded-t-4xl bg-surface shadow-float" : "fixed inset-0 top-[var(--topbar)] z-40 bg-surface"}
          >
            <TripPanel layout="inline" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The group chat's one round button opens two places: the group itself, or what Roam knows about the trip. */}
      <Sheet open={groupMenuOpen} onClose={() => setGroupMenuOpen(false)} side="bottom" ariaLabel="Group options" className="icons-fine rounded-t-4xl bg-background px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <ul>
          <li>
            <Link href={`/trips/${tripId}/group/details`} onClick={() => setGroupMenuOpen(false)} className="flex min-h-16 items-center gap-3.5 rounded-2xl px-3 transition-colors active:bg-muted">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary" aria-hidden><Users className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-display text-base font-medium">Group settings</span><span className="block text-sm text-muted-foreground">Members and the invite link</span></span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
          <li>
            <button type="button" onClick={() => { setGroupMenuOpen(false); setMobileContextOpen(true); }} className="flex min-h-16 w-full items-center gap-3.5 rounded-2xl px-3 text-left transition-colors active:bg-muted">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary" aria-hidden><BookOpen className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-display text-base font-medium">Trip context</span><span className="block text-sm text-muted-foreground">What Roam knows about this trip</span></span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        </ul>
      </Sheet>

      <Sheet open={mobileContextOpen} onClose={() => setMobileContextOpen(false)} side="bottom" ariaLabel="Trip context" className="max-h-[85vh] px-4 pt-4 pb-8">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <p className="eyebrow">Trip context</p>
          <button type="button" onClick={() => setMobileContextOpen(false)} aria-label="Close" className={controlGhost}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim">{contextRail}</div>
      </Sheet>
    </>
  );
}
