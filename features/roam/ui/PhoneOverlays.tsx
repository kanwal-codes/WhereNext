"use client";

import { SheetHeader } from "@/components/SheetHeader";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookOpen, ChevronRight, Users, X } from "lucide-react";
import type { ReactNode } from "react";
import { TripPanel } from "@/components/TripPanel";
import { Sheet, motionTokens } from "@/components/motion-primitives";
import { controlGhost } from "@/features/conversation/ui/blocks/ui";

/** On a narrow screen: the detail panel (a sheet over a scrim, or a full screen), the group options sheet and the trip context sheet. */
export function PhoneOverlays({ tripId, panel, closePanel, groupMenuOpen, setGroupMenuOpen, mobileContextOpen, setMobileContextOpen, contextRail }: {
  tripId: string;
  panel: boolean;
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
        {panel && (
          // A sheet over the conversation, not a screen that replaces it: the chat stays behind the scrim, so closing the sheet puts you back exactly
          // where you were reading. Same height and look as the detail sheet on Discover and Stay (92% of the screen, the page dimmed above it, the header included).
          <motion.div key="panel-scrim" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduceMotion ? undefined : { opacity: 0 }} transition={reduceMotion ? { duration: 0 } : motionTokens.fast} onClick={closePanel} className="fixed inset-0 z-50 bg-black/40" />
        )}
        {panel && (
          <motion.div
            key="panel"
            // `transform` as a whole (not x / y): the browser runs it on the compositor, so the slide keeps its pace while the page works.
            initial={reduceMotion ? false : { transform: "translateY(100%)" }}
            animate={{ transform: "translateY(0%)" }}
            exit={reduceMotion ? undefined : { transform: "translateY(100%)" }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 bottom-0 z-50 h-[92dvh] overflow-hidden rounded-t-4xl bg-background shadow-float"
          >
            <TripPanel layout="inline" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The group chat's one round button opens two places: the group itself, or what Roam knows about the trip. */}
      <Sheet open={groupMenuOpen} onClose={() => setGroupMenuOpen(false)} side="bottom" ariaLabel="Group options" padded>
        <ul>
          <li>
            <Link href={`/trips/${tripId}/group/details`} onClick={() => setGroupMenuOpen(false)} className="flex min-h-16 items-center gap-3.5 rounded-2xl px-3 transition-colors active:bg-muted">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted" aria-hidden><Users className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-display text-base font-medium">Group settings</span><span className="block text-sm text-ink-soft">Members and the invite link</span></span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
          <li>
            <button type="button" onClick={() => { setGroupMenuOpen(false); setMobileContextOpen(true); }} className="flex min-h-16 w-full items-center gap-3.5 rounded-2xl px-3 text-left transition-colors active:bg-muted">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted" aria-hidden><BookOpen className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-display text-base font-medium">Trip context</span><span className="block text-sm text-ink-soft">What Roam knows about this trip</span></span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        </ul>
      </Sheet>

      <Sheet open={mobileContextOpen} onClose={() => setMobileContextOpen(false)} side="bottom" ariaLabel="Trip context" className="max-h-[85vh] px-4 pt-4 pb-8">
        <div className="-mx-4 -mt-1"><SheetHeader title="Trip context" bordered={false} onClose={() => setMobileContextOpen(false)} /></div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim">{contextRail}</div>
      </Sheet>
    </>
  );
}
