"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PanelRight, Scale, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { PlacePanel } from "@/components/PlacePanel";
import { StayPanel } from "@/components/StayPanel";
import { CompareView } from "@/components/CompareView";
import { Reveal } from "@/components/motion-primitives";
import { ConversationSurface } from "@/features/conversation/ui/ConversationSurface";
import { TripContextSurface } from "@/features/workspace/ui/TripContextSurface";
import { useMediaQuery } from "@/lib/use-media-query";
import { useDocumentTitle } from "@/lib/use-document-title";
import type { PlaceCard, StayCardItem } from "@/packages/contracts/assistant";
import type { Trip } from "@/features/trip/domain/trip";

type Workspace =
  | { kind: "place"; placeId: string; placeName: string }
  | { kind: "stay"; hotelId: string; hotelName: string; checkin: string; checkout: string }
  | { kind: "compare"; ids: string[] };

const spring = { type: "spring" as const, stiffness: 180, damping: 26, mass: 0.9 };

export default function ChatPage() {
  const { tripId, data } = useTripData();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const titleTag = useDocumentTitle("Conversation");
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  const showContext = desktop && !workspace && !contextCollapsed;
  const columns = !desktop
    ? "minmax(0, 1fr) 0px"
    : workspace
      ? "minmax(340px, 400px) minmax(0, 1fr)"
      : showContext
        ? "minmax(0, 1fr) 340px"
        : "minmax(0, 1fr) 0px";

  function openPlace(place: PlaceCard) {
    setWorkspace({ kind: "place", placeId: place.providerId, placeName: place.name });
  }
  function openStay(stay: StayCardItem, dates: { checkin: string; checkout: string }) {
    setWorkspace({ kind: "stay", hotelId: stay.hotelId, hotelName: stay.name, checkin: dates.checkin, checkout: dates.checkout });
  }
  function openCompare(ids: string[]) {
    setWorkspace({ kind: "compare", ids: ids.slice(0, 4) });
  }
  function closeWorkspace() {
    setWorkspace(null);
  }

  const contextRail = (
    <TripContextSurface
      tripId={tripId}
      trip={(data?.trip as Trip) ?? null}
      initialMemory={data?.preferences}
      initialDecisions={data?.decisions}
    />
  );

  const panel = !workspace ? null : workspace.kind === "place" ? (
    <PlacePanel
      tripId={tripId}
      placeId={workspace.placeId}
      placeName={workspace.placeName}
      onClose={closeWorkspace}
    />
  ) : workspace.kind === "stay" ? (
    <StayPanel
      tripId={tripId}
      hotelId={workspace.hotelId}
      hotelName={workspace.hotelName}
      checkin={workspace.checkin}
      checkout={workspace.checkout}
      onClose={closeWorkspace}
    />
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="inline-flex items-center gap-1.5 font-display text-sm">
          <Scale className="h-3.5 w-3.5 text-coral" /> Side by side
        </p>
        <button
          type="button"
          onClick={closeWorkspace}
          aria-label="Close comparison"
          className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim p-4">
        <CompareView
          tripId={tripId}
          ids={workspace.ids}
          onIdsChange={(ids) => setWorkspace((w) => (w && w.kind === "compare" ? { ...w, ids } : w))}
        />
      </div>
    </div>
  );

  const workspaceKey = workspace
    ? workspace.kind === "place"
      ? `place:${workspace.placeId}`
      : workspace.kind === "stay"
        ? `stay:${workspace.hotelId}`
        : `compare:${workspace.ids.join(",")}`
    : "none";
  const showToggle = !desktop || !workspace;

  return (
    <div className="flex h-[calc(100dvh-var(--topbar))] min-h-0 flex-col lg:h-screen">
      {titleTag}
      {/* One conversation, one grid; the second column animates open on desktop only. */}
      <motion.div initial={false} animate={{ gridTemplateColumns: columns }} transition={spring} className="grid h-full min-h-0">
        <motion.div layout transition={spring} className="relative flex min-w-0 flex-col overflow-hidden px-4 py-4 sm:px-6 lg:border-r lg:border-border lg:py-5">
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
              onOpenCompare={openCompare}
              rail={desktop && Boolean(workspace)}
            />
          </div>
        </motion.div>

        {desktop && (
          <AnimatePresence mode="wait" initial={false}>
            {workspace ? (
              <motion.section
                key={workspaceKey}
                initial={{ opacity: 0, x: 28, filter: "blur(6px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: 20, filter: "blur(4px)" }}
                transition={{ type: "spring", stiffness: 210, damping: 30, mass: 0.85, delay: 0.06 }}
                className="flex h-full min-h-0 flex-col overflow-hidden bg-surface"
              >
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1], delay: 0.16 }}
                  className="min-h-0 flex-1"
                >
                  {panel}
                </motion.div>
              </motion.section>
            ) : showContext ? (
              <motion.aside
                key="context"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: "spring", stiffness: 240, damping: 28 }}
                className="h-full overflow-y-auto scrollbar-slim border-l border-border bg-surface px-4 py-5"
              >
                {contextRail}
              </motion.aside>
            ) : null}
          </AnimatePresence>
        )}
      </motion.div>

      {!desktop && (
        <>
          {/* Mobile workspace: full-screen slide-up */}
          <AnimatePresence>
            {workspace && (
              <motion.div
                key={workspaceKey}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 240, damping: 30 }}
                className="fixed inset-0 top-[var(--topbar)] z-40 bg-surface"
              >
                {panel}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile trip-context sheet */}
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
                  transition={{ type: "spring", stiffness: 260, damping: 30 }}
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
