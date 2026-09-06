"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PanelRight, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanel, panelSubjectKey, type EventSeed } from "@/components/TripPanelProvider";
import { TripPanel } from "@/components/TripPanel";
import { Reveal, Sheet, motionTokens } from "@/components/motion-primitives";
import { ConversationSurface } from "@/features/conversation/ui/ConversationSurface";
import { TripContextSurface } from "@/features/workspace/ui/TripContextSurface";
import { useMediaQuery } from "@/lib/use-media-query";
import { useDocumentTitle } from "@/lib/use-document-title";
import type { AssistantBlock, PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import type { Trip } from "@/features/trip/domain/trip";

const spring = motionTokens.fast;

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
  function openCollection(title: string, block: AssistantBlock) {
    openPanel({ kind: "collection", title, block });
  }

  const contextRail = (
    <TripContextSurface
      tripId={tripId}
      trip={(data?.trip as Trip) ?? null}
      initialMemory={data?.preferences}
      initialDecisions={data?.decisions}
      itinerary={data?.itinerary}
      savedPlaces={data?.savedPlaces}
      essentials={data?.essentials}
      conversation={data?.conversation}
    />
  );

  const panelKey = panelSubjectKey(panel);
  const showToggle = !desktop || !panel;

  return (
    <div className="flex h-[calc(100dvh-var(--topbar))] min-h-0 w-full max-w-full flex-col overflow-x-hidden lg:h-[100dvh]">
      {titleTag}
      <motion.div initial={false} animate={{ gridTemplateColumns: columns }} transition={reduceMotion ? { duration: 0 } : spring} className="grid h-full min-h-0 w-full min-w-0 max-w-full">
        <motion.div layout transition={reduceMotion ? { duration: 0 } : spring} className="relative flex min-w-0 max-w-full flex-col overflow-hidden px-4 py-4 sm:px-6 lg:border-r lg:border-border lg:py-5">
          <Reveal>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow">Roam</p>
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
              onOpenCollection={openCollection}
              viewContext={
                panel?.kind === "place" || panel?.kind === "stay"
                  ? panel.name
                  : panel?.kind === "event"
                    ? panel.seed.name
                    : panel?.kind === "collection"
                      ? panel.title
                      : undefined
              }
              rail={desktop && Boolean(panel)}
            />
          </div>
        </motion.div>

        {desktop && (
          <div className="h-full min-h-0 overflow-hidden border-l border-border bg-surface">
            <AnimatePresence initial={false} mode="wait">
              {panel ? (
                <motion.div
                  key={panelKey}
                  initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: -16 }}
                  transition={reduceMotion ? { duration: 0 } : spring}
                  className="h-full min-h-0"
                >
                  <TripPanel layout="inline" />
                </motion.div>
              ) : showContext ? (
                <motion.div
                  key="trip-context"
                  initial={reduceMotion ? false : { opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: -12 }}
                  transition={reduceMotion ? { duration: 0 } : spring}
                  className="h-full overflow-y-auto scrollbar-slim px-4 py-5"
                >
                  {contextRail}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {!desktop && (
        <>
          <AnimatePresence initial={false}>
            {panel && (
              <motion.div
                key={panelKey}
                initial={reduceMotion ? false : { y: "100%" }}
                animate={{ y: 0 }}
                exit={reduceMotion ? undefined : { y: "100%" }}
                transition={reduceMotion ? { duration: 0 } : spring}
                className="fixed inset-0 top-[var(--topbar)] z-40 bg-surface"
              >
                <TripPanel layout="inline" />
              </motion.div>
            )}
          </AnimatePresence>

          <Sheet open={mobileContextOpen} onClose={() => setMobileContextOpen(false)} side="bottom" ariaLabel="Trip context" className="max-h-[85vh] px-4 pt-4 pb-8">
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <p className="eyebrow">Trip context</p>
              <button onClick={() => setMobileContextOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim">{contextRail}</div>
          </Sheet>
        </>
      )}
    </div>
  );
}
