"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PanelRight, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { PlacePanel } from "@/components/PlacePanel";
import { ConversationSurface } from "@/features/conversation/ui/ConversationSurface";
import { TripContextSurface } from "@/features/workspace/ui/TripContextSurface";
import type { PlaceCard } from "@/packages/contracts/assistant";
import type { Trip } from "@/features/trip/domain/trip";

type Workspace = { placeId: string; placeName: string };

const spring = { type: "spring" as const, stiffness: 180, damping: 26, mass: 0.9 };

export default function ChatPage() {
  const { tripId, data } = useTripData();
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  const showContext = !workspace && !contextCollapsed;

  const savedIds = new Set(
    (data?.savedPlaces ?? []).map((s) => (s as { places?: { provider_id?: string } }).places?.provider_id).filter(Boolean) as string[],
  );

  function openPlace(place: PlaceCard) {
    setWorkspace({ placeId: place.providerId, placeName: place.name });
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

  const placePanel = workspace ? (
    <PlacePanel
      tripId={tripId}
      placeId={workspace.placeId}
      placeName={workspace.placeName}
      initiallySaved={savedIds.has(workspace.placeId)}
      onClose={closeWorkspace}
    />
  ) : null;

  return (
    <div className="flex h-[calc(100dvh-57px)] min-h-0 flex-col lg:h-screen">
      <div className="min-h-0 flex-1">
        {/* Desktop: animated column grid */}
        <motion.div
          initial={false}
          animate={{
            gridTemplateColumns: workspace
              ? "minmax(360px, 400px) minmax(0, 1fr)"
              : showContext
                ? "minmax(0, 1fr) 340px"
                : "minmax(0, 1fr) 0px",
          }}
          transition={spring}
          className="hidden h-full min-h-0 lg:grid"
        >
          <motion.div layout transition={spring} className="relative flex min-w-0 flex-col overflow-hidden border-r border-border px-4 py-5 sm:px-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow">Travel assistant</p>
                <h1 className="mt-1 truncate font-display text-xl leading-tight">Plan this the way you&rsquo;d talk about it</h1>
              </div>
              {!workspace && (
                <button
                  type="button"
                  onClick={() => setContextCollapsed((c) => !c)}
                  aria-label={contextCollapsed ? "Show trip context" : "Hide trip context"}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[11px] font-medium backdrop-blur transition-colors hover:bg-accent"
                >
                  <PanelRight className="h-3.5 w-3.5" />
                  {contextCollapsed ? "Trip context" : "Hide"}
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <ConversationSurface tripId={tripId} initialMessages={data?.conversation} onOpenPlace={openPlace} rail={Boolean(workspace)} />
            </div>
          </motion.div>

          <AnimatePresence mode="wait" initial={false}>
            {workspace ? (
              <motion.section
                key="workspace"
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
                  {placePanel}
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
        </motion.div>

        {/* Mobile */}
        <div className="relative flex h-full min-h-0 flex-col px-4 py-4 lg:hidden">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Travel assistant</p>
              <h1 className="mt-1 truncate font-display text-lg leading-tight">Plan this the way you&rsquo;d talk about it</h1>
            </div>
            <button
              type="button"
              onClick={() => setMobileContextOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[11px] font-medium backdrop-blur"
            >
              <PanelRight className="h-3.5 w-3.5" /> Trip context
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ConversationSurface tripId={tripId} initialMessages={data?.conversation} onOpenPlace={openPlace} />
          </div>

          {/* Mobile workspace: full-screen slide-up */}
          <AnimatePresence>
            {workspace && (
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 240, damping: 30 }}
                className="fixed inset-0 top-[57px] z-40 bg-surface"
              >
                {placePanel}
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
        </div>
      </div>
    </div>
  );
}
