"use client";

import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PanelRight, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanel, panelSubjectKey, panelTitle, type EventSeed } from "@/components/TripPanelProvider";
import { TripPanel } from "@/components/TripPanel";
import { GroupMembersBadge } from "@/components/GroupMembersBadge";
import { Reveal, Sheet, motionTokens } from "@/components/motion-primitives";
import { ConversationSurface } from "@/features/conversation/ui/ConversationSurface";
import { GroupChatSurface } from "@/features/group-chat/ui/GroupChatSurface";
import { TripContextSurface } from "@/features/workspace/ui/TripContextSurface";
import { useMediaQuery } from "@/lib/use-media-query";
import { useKeyboardFit } from "@/lib/use-keyboard-fit";
import type { AssistantBlock, PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import type { Trip } from "@/features/trip/domain/trip";
import { cn } from "@/lib/utils";
import { useGuest } from "@/features/identity/ui/GuestProvider";

const spring = motionTokens.fast;
const LAYOUT_MOTION = "420ms cubic-bezier(0.22, 1, 0.36, 1)";

/** Same visual as DiscoverTabs (features/places/ui/DiscoverySurface.tsx) — a route change
 *  instead of local state, since Roam and Group chat need to stay independently deep-linkable.
 *  `onSelect` flips the visible pane immediately, in the same tick as the click — see the
 *  `optimisticTab` comment in `RoamShell` for why waiting on the URL itself feels slow. */
function RoamTabs({ tripId, activeTab, onSelect, onGuestLocked }: { tripId: string; activeTab: "roam" | "group"; onSelect: (tab: "roam" | "group") => void; onGuestLocked?: () => void }) {
  return (
    <SegmentedSwitch
      label="Conversation"
      value={activeTab}
      onChange={(key) => (onGuestLocked && key === "group" ? onGuestLocked() : onSelect(key))}
      options={[
        { key: "roam", label: "Roam", href: `/trips/${tripId}/chat` },
        onGuestLocked
          ? { key: "group", label: "Chat", ariaLabel: "Chat, needs an account", locked: true }
          : { key: "group", label: "Chat", href: `/trips/${tripId}/group` },
      ]}
    />
  );
}

export function RoamShell({ tripId, activeTab }: { tripId: string; activeTab: "roam" | "group" }) {
  const { data } = useTripData();
  const { guest, openGate } = useGuest();
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
  // On a phone the Roam / Chat row floats over the top of the conversation and slides away as you read down, and comes
  // back the moment you scroll up (or reach the top, or switch tabs). It is an overlay, so showing and hiding it moves
  // nothing in the log (the log keeps its own top padding): the old version resized the log on every toggle and shook
  // the page. It also steps out of the way while the keyboard is up, to leave the room to the conversation.
  const keyboardOpen = useKeyboardFit(!desktop);
  const [scrolledAway, setScrolledAway] = useState(false);
  const scrollTrack = useRef(new WeakMap<Element, { top: number; run: number }>());
  const onLogScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const top = el.scrollTop;
    const max = el.scrollHeight - el.clientHeight;
    const t = scrollTrack.current.get(el) ?? { top, run: 0 };
    const delta = top - t.top;
    t.top = top;
    // Rubber-banding past either end reports movement that is not the reader's.
    if (top > 0 && top < max) t.run = Math.sign(delta) === Math.sign(t.run) ? t.run + delta : delta;
    scrollTrack.current.set(el, t);
    if (top < 32) setScrolledAway(false);
    else if (t.run > 28) setScrolledAway(true);
    else if (t.run < -14) setScrolledAway(false);
  };
  useEffect(() => setScrolledAway(false), [optimisticTab]);
  const chromeHidden = !desktop && (keyboardOpen || scrolledAway);
  // Both panes stay mounted so switching tabs is instant, but the one you are not on does not need to be built
  // while the page is still arriving (the Roam thread alone is hundreds of controls): it is mounted once the
  // browser is idle, or at once if you switch to it first.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    let idleId = 0;
    const timer = window.setTimeout(() => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(() => setWarm(true), { timeout: 1500 });
      else setWarm(true);
    }, 1500);
    return () => {
      window.clearTimeout(timer);
      if (idleId) (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
    };
  }, []);
  // TripPanelProvider closes `panel` on every pathname change (internal effect, not exposed on
  // its Ctx) — that's what makes switching tabs here also close whatever panel was open on the
  // previous one, with no extra code needed. If that internal behavior is ever removed, this
  // shell's tab switch will start leaking a stale panel across tabs.
  const { panel, openPanel } = useTripPanel();
  const panelOpen = Boolean(panel);

  const showContext = desktop && !panel && !contextCollapsed;
  // Collapsed context doesn't drop to 0 — it stays a slim rail (mirrors TripShell's sidebar
  // collapse) so the re-expand toggle always has somewhere to live, inside the panel it controls.
  const RAIL_WIDTH = 48;
  // Length tracks, not `minmax(…, 1fr)` strings: a track list that mixes `fr` and `px` cannot be interpolated, so
  // the old resize snapped at the end of its animation. Every track is a CSS length the browser resolves itself, in
  // the same frame as the width it depends on. That matters while the trip sidebar slides: the panel's tracks used to
  // be pixels measured from the shell by a ResizeObserver, which reports one frame late, so with a panel open the
  // chat and the panel shook for the whole 420 ms. Now nothing is measured.
  const CHAT_WHEN_PANEL = 512; // 32rem
  // The panel takes what the chat leaves, up to 720 px: a detail view stretched across 940 px reads worse, and the chat gets the rest on a wide screen.
  const PANEL_MAX = 720;
  // Sized from the SCREEN, as if the trip sidebar were open (264 px), not from the room beside it. The sidebar collapsing then
  // hands its 188 px to the chat column and never to the panel, so nothing inside the panel re-wraps while it slides.
  const SIDEBAR_OPEN = 264;
  const panelTrack = `min(${PANEL_MAX}px, max(0px, calc(100vw - ${SIDEBAR_OPEN + CHAT_WHEN_PANEL}px)))`;
  const sideTrack = panel ? panelTrack : `${showContext ? 340 : RAIL_WIDTH}px`;
  const columns = !desktop ? "minmax(0, 1fr) 0px" : `calc(100% - ${sideTrack}) ${sideTrack}`;
  // Animate only when the layout mode changes (panel opens or closes, rail expands); a window resize follows instantly.
  const layoutMode = panel ? "panel" : showContext ? "context" : "rail";
  const lastLayoutMode = useRef(layoutMode);
  const modeChanged = lastLayoutMode.current !== layoutMode;
  useEffect(() => {
    lastLayoutMode.current = layoutMode;
  });

  function openPlace(place: PlaceCard) {
    openPanel({ kind: "place", placeId: place.providerId, name: place.name });
  }
  function openStay(stay: StayCardItem, dates: { checkin: string; checkout: string; adults?: number }) {
    openPanel({ kind: "stay", hotelId: stay.hotelId, name: stay.name, checkin: dates.checkin, checkout: dates.checkout, adults: dates.adults });
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

  return (
    <div data-roam-shell className="flex h-[calc(100dvh-var(--topbar)-var(--tabbar))] min-h-0 w-full max-w-full flex-col overflow-x-hidden lg:h-[100dvh]">
      <div
        // A CSS transition on pixel tracks (they interpolate natively), only for the moment the layout mode changes.
        style={{ gridTemplateColumns: columns, transition: `grid-template-columns ${reduceMotion || !modeChanged ? 0 : LAYOUT_MOTION}` }}
        className="grid h-full min-h-0 w-full min-w-0 max-w-full"
      >
        <div className="relative flex min-w-0 max-w-full flex-col overflow-hidden px-4 py-4 sm:px-6 lg:border-r lg:border-border lg:py-5">
          <div
            // Phone: floats over the log (soft fade behind it so messages passing underneath stay legible) and slides up out of view.
            className={cn(
              "lg:overflow-hidden max-lg:absolute max-lg:inset-x-4 max-lg:top-4 max-lg:z-20 max-lg:transition-[transform,opacity] max-lg:duration-300 max-lg:ease-[cubic-bezier(0.22,1,0.36,1)]",
              "max-lg:before:pointer-events-none max-lg:before:absolute max-lg:before:inset-x-[-1rem] max-lg:before:top-[-1rem] max-lg:before:bottom-[-1.6rem] max-lg:before:-z-10 max-lg:before:bg-gradient-to-b max-lg:before:from-background max-lg:before:from-55% max-lg:before:to-transparent",
              chromeHidden && "max-lg:pointer-events-none max-lg:-translate-y-[calc(100%+1.25rem)] max-lg:opacity-0",
            )}
            inert={chromeHidden}
            aria-hidden={chromeHidden || undefined}
          >
            <Reveal>
                <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 max-lg:mb-0">
                  <div className="justify-self-start">
                    {optimisticTab === "group" && <GroupMembersBadge tripId={tripId} />}
                  </div>
                  <RoamTabs tripId={tripId} activeTab={optimisticTab} onSelect={setOptimisticTab} onGuestLocked={guest ? () => openGate("chat with your group") : undefined} />
                  <div className="justify-self-end">
                    {/* Desktop's show/hide toggle now lives inside the right panel itself (like the
                        trip sidebar's own collapse button) — mobile has no persistent rail to hold
                        one, so it keeps its own trigger here to open the context Sheet. */}
                    {!desktop && (
                      <button
                        type="button"
                        onClick={() => setMobileContextOpen(true)}
                        aria-label="Show trip context"
                        className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-background/95 transition-colors hover:bg-accent"
                      >
                        <PanelRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </Reveal>
          </div>
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
              // `inert`, not just aria-hidden: a hidden pane's message box and buttons must also leave the tab order.
              inert={optimisticTab !== "roam"}
              // `initial={false}`: without it the inactive pane starts at full opacity and fades out, so its text ghosts over the other pane on first paint.
              initial={false}
              animate={{ opacity: optimisticTab === "roam" ? 1 : 0 }}
              transition={reduceMotion ? { duration: 0 } : motionTokens.swap}
            >
              {(warm || optimisticTab === "roam") && <ConversationSurface
                tripId={tripId}
                initialMessages={data?.conversation}
                onOpenPlace={openPlace}
                onOpenStay={openStay}
                onOpenEvent={openEvent}
                onOpenCollection={openCollection}
                onOpenPanel={openPanel}
                onLogScroll={onLogScroll}
                viewContext={panel && panel.kind !== "compare" ? panelTitle(panel) : undefined}
                rail={desktop && Boolean(panel)}
                              />}
            </motion.div>
            <motion.div
              className={cn("absolute inset-0 min-h-0", optimisticTab !== "group" && "pointer-events-none")}
              aria-hidden={optimisticTab !== "group"}
              inert={optimisticTab !== "group"}
              initial={false}
              animate={{ opacity: optimisticTab === "group" ? 1 : 0 }}
              transition={reduceMotion ? { duration: 0 } : motionTokens.swap}
            >
              {!guest && (warm || optimisticTab === "group") && <GroupChatSurface tripId={tripId} initialMessages={data?.groupChat} onLogScroll={onLogScroll} rail={desktop && Boolean(panel)} />}
            </motion.div>
          </div>
        </div>

        {desktop && (
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
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.42, ease: motionTokens.swap.ease }}
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
        )}
      </div>

      {!desktop && (
        <>
          <AnimatePresence initial={false}>
            {panel && (
              <motion.div
                key="panel"
                initial={reduceMotion ? false : { y: "100%" }}
                animate={{ y: 0 }}
                exit={reduceMotion ? undefined : { y: "100%" }}
                transition={reduceMotion ? { duration: 0 } : motionTokens.panelSpring}
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
