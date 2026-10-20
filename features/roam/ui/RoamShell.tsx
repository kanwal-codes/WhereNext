"use client";

import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { PHONE_ROUND, useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { PHONE_V2 } from "@/lib/phone-v2";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Ellipsis, PanelRight } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanel, panelTitle, type EventSeed } from "@/components/TripPanelProvider";
import { GroupMembersBadge } from "@/components/GroupMembersBadge";
import { Reveal, motionTokens } from "@/components/motion-primitives";
import { ConversationSurface } from "@/features/conversation/ui/ConversationSurface";
import { GroupChatSurface } from "@/features/group-chat/ui/GroupChatSurface";
import { TripContextSurface } from "@/features/workspace/ui/TripContextSurface";
import { useMediaQuery } from "@/lib/use-media-query";
import { SidePane } from "./SidePane";
import { PhoneOverlays } from "./PhoneOverlays";
import { layoutModeOf, shellColumns } from "../domain/shell-layout";
import { useChromeScroll } from "../application/useChromeScroll";
import { useIdleWarm } from "../application/useIdleWarm";
import { usePanelStyle } from "@/lib/use-panel-style";
import type { AssistantBlock, PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import type { Trip } from "@/features/trip/domain/trip";
import { cn } from "@/lib/utils";
import { useGuest } from "@/features/identity/ui/GuestProvider";
// Same curve as `motionTokens.swap` (the panel's own crossfade), derived rather than copied so
// the two can't drift apart again — they used to both run 420ms; shortening the crossfade alone
// left the column width still resizing for 180ms after the content had already finished fading
// in, which is what read as a stutter instead of one glide.
const LAYOUT_MOTION = `${motionTokens.swap.duration * 1000}ms cubic-bezier(${motionTokens.swap.ease.join(", ")})`;

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
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const sheetPanel = usePanelStyle() === "sheet";
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
  const { keyboardOpen, scrolledAway, onLogScroll } = useChromeScroll({ desktop, resetOn: optimisticTab });
  // Phone redesign: no floating Roam | Chat row. Roam and Group chat are two screens, each with its own title in the page header
  // (the title follows the pane the instant it is tapped, not when the URL catches up) and one round button at its right edge.
  const phoneV2 = PHONE_V2 && !desktop;
  const chromeHidden = !desktop && !phoneV2 && (keyboardOpen || scrolledAway);
  const headerTrailing = useMemo(() => {
    if (!phoneV2) return undefined;
    if (optimisticTab === "group") {
      return guest ? undefined : (
        <button type="button" onClick={() => setGroupMenuOpen(true)} aria-label="Group options" aria-haspopup="dialog" className={PHONE_ROUND}><Ellipsis className="size-[1.2rem]" /></button>
      );
    }
    return (
      <button type="button" onClick={() => setMobileContextOpen(true)} aria-label="Trip context" className={PHONE_ROUND}><Ellipsis className="size-[1.2rem]" /></button>
    );
  }, [phoneV2, optimisticTab, guest]);
  useSetPhoneHeader({ title: phoneV2 ? (optimisticTab === "group" ? "Group chat" : "Roam") : undefined, trailing: headerTrailing });
  const warm = useIdleWarm();
  // TripPanelProvider closes `panel` on every pathname change (internal effect, not exposed on
  // its Ctx) — that's what makes switching tabs here also close whatever panel was open on the
  // previous one, with no extra code needed. If that internal behavior is ever removed, this
  // shell's tab switch will start leaking a stale panel across tabs.
  const { panel, openPanel, closePanel } = useTripPanel();

  const showContext = desktop && !panel && !contextCollapsed;
  const columns = shellColumns({ desktop, hasPanel: Boolean(panel), showContext });
  // Animate only when the layout mode changes (panel opens or closes, rail expands); a window resize follows instantly.
  const layoutMode = layoutModeOf({ hasPanel: Boolean(panel), showContext });
  const lastLayoutMode = useRef(layoutMode);
  const modeChanged = lastLayoutMode.current !== layoutMode;
  useEffect(() => {
    lastLayoutMode.current = layoutMode;
  });

  // Stable for the life of the shell. Both chat surfaces are memoized, and a tab switch re-renders this
  // shell: handed new function identities they would both re-render in full — two long message logs,
  // every card in them — for a change that only moves a pill and crossfades two layers.
  const openPlace = useCallback((place: PlaceCard) => {
    openPanel({ kind: "place", placeId: place.providerId, name: place.name });
  }, [openPanel]);
  const openStay = useCallback((stay: StayCardItem, dates: { checkin: string; checkout: string; adults?: number }, ask: (prompt: string) => void) => {
    openPanel({ kind: "stay", hotelId: stay.hotelId, name: stay.name, checkin: dates.checkin, checkout: dates.checkout, adults: dates.adults, onAsk: ask });
  }, [openPanel]);
  const openEvent = useCallback((seed: EventSeed) => {
    openPanel({ kind: "event", seed });
  }, [openPanel]);
  const openCollection = useCallback((title: string, block: AssistantBlock) => {
    openPanel({ kind: "collection", title, block });
  }, [openPanel]);

  const contextRail = (
    <TripContextSurface
      tripId={tripId}
      trip={(data?.trip as Trip) ?? null}
      initialMemory={data?.preferences}
      initialDecisions={data?.decisions}
    />
  );

  return (
    <div data-roam-shell className={cn(PHONE_V2 && "icons-fine", "flex h-[calc(100dvh-var(--topbar)-var(--tabbar))] min-h-0 w-full max-w-full flex-col overflow-x-hidden lg:h-[100dvh]")}>
      <div
        // A CSS transition on pixel tracks (they interpolate natively), only for the moment the layout mode changes.
        style={{ gridTemplateColumns: columns, transition: `grid-template-columns ${reduceMotion || !modeChanged ? 0 : LAYOUT_MOTION}` }}
        className="grid h-full min-h-0 w-full min-w-0 max-w-full"
      >
        <div className={cn("relative flex min-w-0 max-w-full flex-col overflow-hidden px-4 py-4 sm:px-6 lg:border-r lg:border-border lg:py-5", PHONE_V2 && "max-lg:pt-1")}>
          {!phoneV2 && <div
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
          </div>}
          {/* Both surfaces stay mounted permanently — switching tabs then costs nothing (no
              refetch, no lost scroll position). Each pane is absolutely stacked inside this one
              relative slot and crossfades on `optimisticTab` (a plain opacity toggle would have
              needed `display:none` on the inactive one, which is what `hidden` used to do here —
              switched to `pointer-events-none` + `aria-hidden` instead so the fade is visible
              instead of an instant cut). Each still only receives the shared handlers/data
              relevant while active. */}
          <div className="relative min-h-0 flex-1">
            <motion.div
              className={cn("absolute inset-0 min-h-0", optimisticTab !== "roam" && "pointer-events-none", PHONE_V2 && optimisticTab !== "roam" && "max-lg:[content-visibility:hidden]")}
              aria-hidden={optimisticTab !== "roam"}
              // `inert`, not just aria-hidden: a hidden pane's message box and buttons must also leave the tab order.
              inert={optimisticTab !== "roam"}
              // `initial={false}`: without it the inactive pane starts at full opacity and fades out, so its text ghosts over the other pane on first paint.
              initial={false}
              animate={{ opacity: optimisticTab === "roam" ? 1 : 0 }}
              transition={reduceMotion || phoneV2 ? { duration: 0 } : motionTokens.swap}
            >
              {(warm || optimisticTab === "roam") && <ConversationSurface
                tripId={tripId}
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
              className={cn("absolute inset-0 min-h-0", optimisticTab !== "group" && "pointer-events-none", PHONE_V2 && optimisticTab !== "group" && "max-lg:[content-visibility:hidden]")}
              aria-hidden={optimisticTab !== "group"}
              inert={optimisticTab !== "group"}
              initial={false}
              animate={{ opacity: optimisticTab === "group" ? 1 : 0 }}
              transition={reduceMotion || phoneV2 ? { duration: 0 } : motionTokens.swap}
            >
              {!guest && (warm || optimisticTab === "group") && <GroupChatSurface tripId={tripId} onLogScroll={onLogScroll} rail={desktop && Boolean(panel)} active={optimisticTab === "group"} />}
            </motion.div>
          </div>
        </div>

        {desktop && <SidePane panel={Boolean(panel)} showContext={showContext} setContextCollapsed={setContextCollapsed} contextRail={contextRail} />}
      </div>

      {!desktop && <PhoneOverlays tripId={tripId} panel={Boolean(panel)} sheetPanel={sheetPanel} closePanel={closePanel} groupMenuOpen={groupMenuOpen} setGroupMenuOpen={setGroupMenuOpen} mobileContextOpen={mobileContextOpen} setMobileContextOpen={setMobileContextOpen} contextRail={contextRail} />}
    </div>
  );
}
