"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PanelRight, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanel, type EventSeed } from "@/components/TripPanelProvider";
import { TripPanel } from "@/components/TripPanel";
import { Reveal } from "@/components/motion-primitives";
import { ConversationSurface } from "@/features/conversation/ui/ConversationSurface";
import { TripContextSurface } from "@/features/workspace/ui/TripContextSurface";
import { useMediaQuery } from "@/lib/use-media-query";
import { useDocumentTitle } from "@/lib/use-document-title";
import type { PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import type { Trip } from "@/features/trip/domain/trip";

const spring = { type: "spring" as const, stiffness: 260, damping: 28, mass: 0.9 };

export default function ChatPage() {
  const { tripId, data } = useTripData();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const reduceMotion = useReducedMotion();
  const titleTag = useDocumentTitle("Conversation");
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const { panel, openPanel } = useTripPanel();

  const showContext = desktop && !panel && !contextCollapsed;
  const columns = !desktop
    ? "minmax(0, 1fr) 0px"
    : panel
      ? "minmax(340px, 400px) minmax(0, 1fr)"
      : showContext
        ? "minmax(0, 1fr) 340px"
        : "minmax(0, 1fr) 0px";

  function openPlace(place: PlaceCard) {
    openPanel({ kind: "place", placeId: place.providerId, name: place.name });
  }
  function openStay(stay: StayCardItem, dates: { checkin: string; checkout: string }) {
    openPanel({ kind: "stay", hotelId: stay.hotelId, name: stay.name, checkin: dates.checkin, checkout: dates.checkout });
  }
  function openEvent(seed: EventSeed) {
    openPanel({ kind: "event", seed });
  }

  const contextRail = (
    <TripContextSurface
      tripId={tripId}
      trip={(data?.trip as Trip) ?? null}
      initialMemory={data?.preferences}
      initialDecisions={data?.decisions}
    />
  );

  const panelKey = panel
    ? panel.kind === "place"
      ? `place:${panel.placeId}`
      : panel.kind === "stay"
        ? `stay:${panel.hotelId}`
        : panel.kind === "event"
          ? `event:${panel.seed.url}`
          : "compare"
    : "none";
  const showToggle = !desktop || !panel;

  return (
    <div className="flex h-[calc(100dvh-var(--topbar))] min-h-0 flex-col lg:h-screen">
      {titleTag}
      <motion.div initial={false} animate={{ gridTemplateColumns: columns }} transition={reduceMotion ? { duration: 0 } : spring} className="grid h-full min-h-0">
        <motion.div layout transition={reduceMotion ? { duration: 0 } : spring} className="relative flex min-w-0 flex-col overflow-hidden px-4 py-4 sm:px-6 lg:border-r lg:border-border lg:py-5">
          <Reveal>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow">Travel assistant</p>
                <h1 className="mt-1 truncate font-display text-lg leading-tight lg:text-xl">Plan this the way you&rsquo;d talk about it</h1>
              </div>
              {showToggle && (
                <button
                  type="button"
                  onClick={() => (desktop ? setContextCollapsed((c) => !c) : setMobileContextOpen(true))}
                  aria-label={desktop ? (contextCollapsed ? "Show trip context" : "Hide trip context") : "Show trip context"}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[11px] font-medium backdrop-blur transition-colors hover:bg-accent"
                >
                  <PanelRight className="h-3.5 w-3.5" />
                  {desktop && !contextCollapsed ? "Hide" : "Trip context"}
                </button>
              )}
            </div>
          </Reveal>
          <div className="min-h-0 flex-1">
            <ConversationSurface
              tripId={tripId}
              initialMessages={data?.conversation}
              onOpenPlace={openPlace}
              onOpenStay={openStay}
              onOpenEvent={openEvent}
              viewContext={panel?.kind === "place" || panel?.kind === "stay" ? panel.name : undefined}
              rail={desktop && Boolean(panel)}
            />
          </div>
        </motion.div>

        {desktop && (panel || showContext) && (
          <div className="h-full min-h-0 overflow-hidden border-l border-border bg-surface">
            {panel ? (
              <motion.div
                key={panelKey}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={reduceMotion ? { duration: 0 } : spring}
                className="h-full min-h-0"
              >
                <TripPanel layout="inline" />
              </motion.div>
            ) : (
              <div className="h-full overflow-y-auto scrollbar-slim px-4 py-5">{contextRail}</div>
            )}
          </div>
        )}
      </motion.div>

      {!desktop && (
        <>
          {panel && (
            <motion.div
              key={panelKey}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              transition={reduceMotion ? { duration: 0 } : spring}
              className="fixed inset-0 top-[var(--topbar)] z-40 bg-surface"
            >
              <TripPanel layout="inline" />
            </motion.div>
          )}

          <AnimatePresence>
            {mobileContextOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-end bg-ink/30"
                onClick={() => setMobileContextOpen(false)}
              >
                <motion.div
                  initial={{ y: 260 }}
                  animate={{ y: 0 }}
                  exit={{ y: 260 }}
              transition={reduceMotion ? { duration: 0 } : spring}
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-[85vh] w-full overflow-y-auto scrollbar-slim rounded-t-3xl bg-surface px-4 pt-4 pb-8"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="eyebrow">Trip context</p>
                    <button onClick={() => setMobileContextOpen(false)} aria-label="Close">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {contextRail}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
