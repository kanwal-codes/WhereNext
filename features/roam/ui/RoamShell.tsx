"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PanelRight, PanelRightClose, PanelRightOpen, Users, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanel, panelSubjectKey, type EventSeed } from "@/components/TripPanelProvider";
import { TripPanel } from "@/components/TripPanel";
import { Reveal, Sheet, motionTokens } from "@/components/motion-primitives";
import { ConversationSurface } from "@/features/conversation/ui/ConversationSurface";
import { GroupChatSurface } from "@/features/group-chat/ui/GroupChatSurface";
import { TripContextSurface } from "@/features/workspace/ui/TripContextSurface";
import { useMediaQuery } from "@/lib/use-media-query";
import type { AssistantBlock, PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import type { Trip } from "@/features/trip/domain/trip";
import { cn } from "@/lib/utils";

const spring = motionTokens.fast;

/** Same visual as DiscoverTabs (features/places/ui/DiscoverySurface.tsx) — a route change
 *  instead of local state, since Roam and Group chat need to stay independently deep-linkable. */
function RoamTabs({ tripId, activeTab }: { tripId: string; activeTab: "roam" | "group" }) {
  const router = useRouter();
  const tabs = [
    { key: "roam" as const, label: "Roam", href: `/trips/${tripId}/chat` },
    { key: "group" as const, label: "Chat", href: `/trips/${tripId}/group` },
  ];
  return (
    <div className="inline-flex rounded-full bg-muted p-1 text-sm">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => router.push(tab.href)}
          className={cn(
            "rounded-full px-4 py-1.5 font-medium transition-colors",
            activeTab === tab.key ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function RoamShell({ tripId, activeTab }: { tripId: string; activeTab: "roam" | "group" }) {
  const { data } = useTripData();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const reduceMotion = useReducedMotion();
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  // TripPanelProvider closes `panel` on every pathname change (internal effect, not exposed on
  // its Ctx) — that's what makes switching tabs here also close whatever panel was open on the
  // previous one, with no extra code needed. If that internal behavior is ever removed, this
  // shell's tab switch will start leaking a stale panel across tabs.
  const { panel, openPanel } = useTripPanel();

  const showContext = desktop && !panel && !contextCollapsed;
  // Collapsed context doesn't drop to 0 — it stays a slim rail (mirrors TripShell's sidebar
  // collapse) so the re-expand toggle always has somewhere to live, inside the panel it controls.
  const RAIL_WIDTH = 48;
  const columns = !desktop
    ? "minmax(0, 1fr) 0px"
    : panel
      ? "minmax(340px, 400px) minmax(0, 1fr)"
      : showContext
        ? "minmax(0, 1fr) 340px"
        : `minmax(0, 1fr) ${RAIL_WIDTH}px`;

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

  return (
    <div className="flex h-[calc(100dvh-var(--topbar))] min-h-0 w-full max-w-full flex-col overflow-x-hidden lg:h-[100dvh]">
      <motion.div initial={false} animate={{ gridTemplateColumns: columns }} transition={reduceMotion ? { duration: 0 } : spring} className="grid h-full min-h-0 w-full min-w-0 max-w-full">
        <motion.div layout transition={reduceMotion ? { duration: 0 } : spring} className="relative flex min-w-0 max-w-full flex-col overflow-hidden px-4 py-4 sm:px-6 lg:border-r lg:border-border lg:py-5">
          <Reveal>
            <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="justify-self-start">
                {activeTab === "group" && (
                  <Link
                    href={`/trips/${tripId}/group/details`}
                    aria-label="Group details"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[11px] font-medium backdrop-blur transition-colors hover:bg-accent"
                  >
                    <Users className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
              <RoamTabs tripId={tripId} activeTab={activeTab} />
              <div className="justify-self-end">
                {/* Desktop's show/hide toggle now lives inside the right panel itself (like the
                    trip sidebar's own collapse button) — mobile has no persistent rail to hold
                    one, so it keeps its own trigger here to open the context Sheet. */}
                {!desktop && (
                  <button
                    type="button"
                    onClick={() => setMobileContextOpen(true)}
                    aria-label="Show trip context"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 backdrop-blur transition-colors hover:bg-accent"
                  >
                    <PanelRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </Reveal>
          {/* Both surfaces stay mounted permanently and are toggled with `hidden` rather than
              conditionally rendered — switching tabs then costs nothing (no refetch, no lost
              scroll position, no re-animation), matching how Discover/Saved-style pills should
              feel. Each still only receives the shared handlers/data relevant while active. */}
          <div className={cn("min-h-0 flex-1", activeTab !== "roam" && "hidden")}>
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
          <div className={cn("min-h-0 flex-1", activeTab !== "group" && "hidden")}>
            <GroupChatSurface tripId={tripId} />
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
                  className="flex h-full flex-col overflow-hidden"
                >
                  <div className="flex shrink-0 justify-start px-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setContextCollapsed(true)}
                      aria-label="Hide trip context"
                      title="Hide trip context"
                      className="shrink-0 rounded-full border border-border bg-background/60 p-1.5 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                    >
                      <PanelRightClose className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-4 pb-5">{contextRail}</div>
                </motion.div>
              ) : (
                <motion.div
                  key="trip-context-rail"
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : spring}
                  className="flex h-full flex-col items-center pt-3"
                >
                  <button
                    type="button"
                    onClick={() => setContextCollapsed(false)}
                    aria-label="Show trip context"
                    title="Show trip context"
                    className="shrink-0 rounded-full border border-border bg-background/60 p-1.5 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                  >
                    <PanelRightOpen className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
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
