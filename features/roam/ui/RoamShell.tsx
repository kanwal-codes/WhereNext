"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PanelRight, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanel, panelSubjectKey, type EventSeed } from "@/components/TripPanelProvider";
import { TripPanel } from "@/components/TripPanel";
import { GroupMembersBadge } from "@/components/GroupMembersBadge";
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
 *  instead of local state, since Roam and Group chat need to stay independently deep-linkable.
 *  `onSelect` flips the visible pane immediately, in the same tick as the click — see the
 *  `optimisticTab` comment in `RoamShell` for why waiting on the URL itself feels slow. */
function RoamTabs({ tripId, activeTab, onSelect }: { tripId: string; activeTab: "roam" | "group"; onSelect: (tab: "roam" | "group") => void }) {
  const tabs = [
    { key: "roam" as const, label: "Roam", href: `/trips/${tripId}/chat` },
    { key: "group" as const, label: "Chat", href: `/trips/${tripId}/group` },
  ];
  return (
    <div className="inline-flex rounded-full bg-muted p-1 text-sm">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          prefetch
          onClick={() => onSelect(tab.key)}
          className={cn(
            "rounded-full px-4 py-1.5 font-medium transition-colors",
            activeTab === tab.key ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
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
  // `activeTab` is derived one layer up from `usePathname()`, which only updates once Next's
  // router finishes the /chat<->/group navigation — a real network round trip for that route's
  // RSC payload, since `router.refresh()` (called from `TripDataProvider` on every realtime
  // workspace change, which includes every new conversation message) invalidates Next's router
  // cache constantly during an active chat, so the Link's own `prefetch` is rarely warm when it
  // matters. Both surfaces are already permanently mounted below purely for CSS toggling, so
  // there's no real reason the VISIBLE switch needs to wait on that round trip at all — this
  // local, optimistic copy flips the instant the tab is clicked (same tick, before the URL even
  // starts changing) and the effect below just keeps it in sync once the real `activeTab` catches
  // up (a moment later, or immediately via back/forward navigation).
  const [optimisticTab, setOptimisticTab] = useState(activeTab);
  useEffect(() => setOptimisticTab(activeTab), [activeTab]);
  // The avatars/tabs header hides on scroll-down (to give the chat log more room) and comes back
  // on scroll-up — the classic mobile chat pattern.
  //
  // This used to be wired via `onScrollCapture` on an ancestor, on the theory that a capture
  // listener still fires for a "scroll" event targeted at a descendant, so neither surface would
  // need to forward a ref. In practice that caught scroll events from ANY scrollable descendant,
  // not just the one log actually meant to drive this — two confirmed, separate ways that went
  // wrong live: (1) a horizontal place/stay/event card carousel (`overflow-x-auto` rows in
  // MessageBlocks.tsx) — swiping through cards fires scroll events whose `scrollTop` is always
  // 0, read as "scrolled way up" against whatever the real log's `lastScrollTop` last was; (2)
  // once both chat surfaces started staying permanently mounted (for the tab-crossfade), the
  // INACTIVE surface's own background auto-scroll-to-bottom (a plain new message arriving while
  // its tab isn't even the one showing) fired real scroll events on ITS log, which the shared
  // ancestor listener couldn't tell apart from the visible one's. Both produced bogus deltas
  // that flipped the header at the wrong moment — the "sometimes it hides, sometimes it doesn't"
  // and the jank right as a scroll gesture settled. Fixed by wiring `handleLogScroll` directly
  // to each surface's own log element via a plain `onLogScroll` prop, passed only to whichever
  // surface is actually the active tab (see the `optimisticTab === ...` checks below) — no
  // ambiguity about which element or which tab fired it, by construction.
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollTop = useRef(0);
  const scrollRaf = useRef(0);
  useEffect(() => {
    lastScrollTop.current = 0;
    setHeaderHidden(false);
    // A rAF scheduled for the tab being left behind would otherwise still fire against its
    // (now-inactive) log node right after switching — harmless, but pointless.
    return () => { if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current); scrollRaf.current = 0; };
  }, [optimisticTab]);
  function handleLogScroll(e: React.UIEvent<HTMLDivElement>) {
    const node = e.currentTarget;
    // A native "scroll" event can fire many times per frame (per-pixel on some trackpads/touch
    // devices) — batching to at most once per animation frame avoids redundant, sometimes
    // conflicting `setHeaderHidden` calls piling up within the same frame, part of what made the
    // header's settle feel janky right as a scroll gesture stopped.
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = 0;
      if (node.scrollHeight <= node.clientHeight) return; // nothing to scroll yet
      const top = node.scrollTop;
      const delta = top - lastScrollTop.current;
      lastScrollTop.current = top;
      if (top < 24) { setHeaderHidden(false); return; }
      if (Math.abs(delta) < 4) return; // ignore inertial/sub-pixel jitter
      setHeaderHidden(delta > 0);
    });
  }
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
          <motion.div
            initial={false}
            animate={{ height: headerHidden ? 0 : "auto", opacity: headerHidden ? 0 : 1 }}
            transition={reduceMotion ? { duration: 0 } : motionTokens.standard}
            className="overflow-hidden"
          >
            {/* The container's height-collapse (above) reclaims the vertical space; this inner
                translate is layered on top purely for feel — the row itself glides up and out
                rather than just shrinking in place, then springs back down on the way in. Same
                spring drives both, so they read as one continuous motion, not two competing ones. */}
            <motion.div
              animate={{ y: headerHidden ? -12 : 0 }}
              transition={reduceMotion ? { duration: 0 } : motionTokens.standard}
            >
              <Reveal>
                <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="justify-self-start">
                    {optimisticTab === "group" && <GroupMembersBadge tripId={tripId} />}
                  </div>
                  <RoamTabs tripId={tripId} activeTab={optimisticTab} onSelect={setOptimisticTab} />
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
            </motion.div>
          </motion.div>
          {/* Both surfaces stay mounted permanently — switching tabs then costs nothing (no
              refetch, no lost scroll position). Each pane is absolutely stacked inside this one
              relative slot and crossfades on `optimisticTab` (a plain opacity toggle would have
              needed `display:none` on the inactive one, which is what `hidden` used to do here —
              switched to `pointer-events-none` + `aria-hidden` instead so the fade is visible
              instead of an instant cut). Each still only receives the shared handlers/data
              relevant while active. */}
          <div className="relative min-h-0 flex-1">
            <motion.div
              className={cn("absolute inset-0 min-h-0", optimisticTab !== "roam" && "pointer-events-none")}
              aria-hidden={optimisticTab !== "roam"}
              animate={{ opacity: optimisticTab === "roam" ? 1 : 0 }}
              transition={reduceMotion ? { duration: 0 } : motionTokens.swap}
            >
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
                onLogScroll={optimisticTab === "roam" ? handleLogScroll : undefined}
              />
            </motion.div>
            <motion.div
              className={cn("absolute inset-0 min-h-0", optimisticTab !== "group" && "pointer-events-none")}
              aria-hidden={optimisticTab !== "group"}
              animate={{ opacity: optimisticTab === "group" ? 1 : 0 }}
              transition={reduceMotion ? { duration: 0 } : motionTokens.swap}
            >
              <GroupChatSurface tripId={tripId} onLogScroll={optimisticTab === "group" ? handleLogScroll : undefined} />
            </motion.div>
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
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim px-4 pb-5">{contextRail}</div>
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
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim">{contextRail}</div>
          </Sheet>
        </>
      )}
    </div>
  );
}
