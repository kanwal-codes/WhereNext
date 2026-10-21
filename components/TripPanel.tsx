"use client";

import { useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanelMaybe, panelSubjectKey, panelTitle, type PanelState } from "@/components/TripPanelProvider";
import { TripPanelBody } from "@/components/TripPanelBody";
import { TripPanelComposer } from "@/components/TripPanelComposer";
import { TripPanelHeader } from "@/components/TripPanelHeader";
import { useTripPanelChrome } from "@/components/useTripPanelChrome";
import { readStayDecision } from "@/packages/contracts/stay";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { ContentSwap, Sheet } from "@/components/motion-primitives";
import { PanelLoading } from "@/components/PanelStates";
import { readPlaceSeed } from "@/features/places/application/placeDetailsCache";
import { useCompareChat } from "@/components/useCompareChat";
import type { Anchor } from "@/components/tripPanelLogic";

/** Routes that mount their own `layout="inline"` TripPanel (via RoamShell) — the layout-level
 *  drawer instance stands down on these so the two don't both try to show the same panel. */
const SELF_HOSTED_INLINE_PANEL_ROUTES = ["/chat", "/group"];

/** The one shared trip side panel: detail views, comparisons, and a composer wired to the trip chat. */
export function TripPanel({ layout = "drawer" }: { layout?: "drawer" | "inline" }) {
  const ctx = useTripPanelMaybe();
  const { tripId, data } = useTripData();
  const pathname = usePathname();
  const desktop = useMediaQuery("(min-width: 1024px)");

  const panel = ctx?.panel ?? null;
  const closePanel = ctx?.closePanel;
  const navDirection = ctx?.navDirection ?? "forward";
  const compareList = ctx?.compareList ?? [];
  // The panel content survives a close so the sheet slides out with something in it.
  const lastPanelRef = useRef<PanelState | null>(null);
  if (panel) lastPanelRef.current = panel;
  const shown = panel ?? lastPanelRef.current;
  const sk = panelSubjectKey(shown, compareList.map((e) => e.id));

  const chat = useCompareChat({ panel, shown, compareList, tripId, subjectKey: sk });
  const { scrollRef, panelRef, slid, composerHeight, composerBox } = useTripPanelChrome({ layout, desktop, panel, closePanel, subjectKey: sk, navDirection });

  // RoamShell (Roam + Group chat) renders its own <TripPanel layout="inline" />; the
  // layout-level drawer stands down on those routes. `endsWith` doesn't match "/group/details",
  // which has no inline panel of its own and must keep using this ambient drawer normally.
  if (!ctx || (layout === "drawer" && SELF_HOSTED_INLINE_PANEL_ROUTES.some((seg) => pathname?.endsWith(seg)))) return null;
  const { compareRemove, goBack, canGoBack } = ctx;

  const stay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);
  const anchor: Anchor = stay && stay.latitude != null && stay.longitude != null ? { name: stay.hotelName, lat: stay.latitude, lng: stay.longitude } : null;

  const body: ReactNode = shown && <TripPanelBody shown={shown} tripId={tripId} openPanel={ctx.openPanel} compareList={compareList} compareRemove={compareRemove} anchor={anchor} chat={chat} />;

  // The surface (header + scroll frame) stays put; only this crossfades between subjects.
  // Flight, day, budget and route are cards and rows with no width of their own: on a wide panel or a tablet sheet they keep a 40rem reading column, like the detail views do.
  const narrow = shown ? ["flight", "day", "budget", "route", "area", "weather", "checklist"].includes(shown.kind) : false;
  // On a phone the route is a map with a sheet over it (see RouteDetail) and needs the panel's whole height, not a reading column.
  const fill = shown?.kind === "route" && !desktop;
  const animatedBody = <ContentSwap swapKey={sk} className={fill ? "h-full" : "min-h-full"}>{narrow && !fill ? <div className="mx-auto w-full max-w-[40rem]">{body}</div> : body}</ContentSwap>;
  const header = shown && (
    <TripPanelHeader shown={shown} layout={layout} tripId={tripId} compareIds={compareList.map((e) => e.id)} canGoBack={canGoBack} goBack={goBack} hasChat={chat.chat.length > 0} clearChat={chat.clear} closePanel={closePanel} />
  );

  // A "See all" list is just being browsed: no question bar over it.
  const composer = layout === "drawer" && panel && panel.kind !== "collection" && <TripPanelComposer boxRef={composerBox} chat={chat} isCompare={panel.kind === "compare"} />;

  // Chat route: render inline in its own column — no drawer chrome, no composer (the main chat serves).
  if (layout === "inline") {
    // `shown` (not `panel`): while the shell slides the panel away the content must still be there, not an empty frame.
    return shown ? (
      <div ref={panelRef} role="complementary" aria-label={shown ? panelTitle(shown) : "Details"} tabIndex={-1} className="flex h-full min-h-0 flex-col outline-none">
        {header}
        <div ref={scrollRef} className="min-h-0 flex-1 overscroll-contain overflow-x-hidden overflow-y-auto scrollbar-slim">
          {slid ? animatedBody : <PanelLoading what="the details" panel seed={shown.kind === "place" ? readPlaceSeed(tripId, shown.placeId) : null} />}
        </div>
      </div>
    ) : null;
  }

  const pill = ctx.compareMode && compareList.length > 0 && panel?.kind !== "compare" && (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 shadow-lift">
        <span className="inline-flex items-center gap-1.5 pl-2 text-sm font-medium">
          Compare {compareList.length}
        </span>
        <button type="button" onClick={ctx.openCompare} className="btn-primary-sm">
          Open
        </button>
        <button type="button" onClick={ctx.compareClear} aria-label="Clear comparison" className="rounded-full p-1.5 text-muted-foreground hover:bg-accent">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );

  return (
    <>
      <AnimatePresence>{pill}</AnimatePresence>
      <Sheet
        open={Boolean(panel)}
        onClose={() => closePanel?.()}
        side={desktop ? "right" : "bottom"}
        // A fixed height on phones, so the sheet does not grow when the content arrives.
        className={desktop ? undefined : "h-[92dvh]"}
        ariaLabel={shown ? panelTitle(shown) : undefined}
      >
        {header}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} style={composer ? { paddingBottom: composerHeight } : undefined} className="min-h-0 flex-1 overscroll-contain overflow-x-hidden overflow-y-auto scrollbar-slim">{animatedBody}</div>
          {composer}
        </div>
      </Sheet>
    </>
  );
}
