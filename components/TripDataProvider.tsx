"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { useTripRealtime, type PresencePeer } from "@/lib/client/trip-realtime";
import { primeTrip } from "@/lib/client/offline-store";
import type { TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";

type TripDataValue = {
  tripId: string;
  /** Server-loaded snapshot; null in the credential-free `rebuild-preview` route. */
  data: TripWorkspaceData | null;
  /** The signed-in viewer; undefined only in the credential-free `rebuild-preview` route. */
  me?: { userId: string; name: string };
};

const TripDataContext = createContext<TripDataValue | null>(null);
// Presence (who's viewing right now) changes far more often than the trip data itself — its own
// context so a collaborator's presence ping doesn't re-render every consumer of `useTripData()`
// (the map, Roam, the trip panel, the itinerary, Discover...), only the one component that
// actually shows who's here.
const TripPresenceContext = createContext<PresencePeer[]>([]);

export function TripDataProvider({
  tripId,
  data,
  me,
  children,
}: {
  tripId: string;
  data: TripWorkspaceData | null;
  me?: { userId: string; name: string };
  children: ReactNode;
}) {
  const router = useRouter();

  // Mutations across the app announce a change on the window event bus; route it through
  // Next's data refresh so server components re-render with fresh data, and keep the offline
  // mirror for the "Today" view warm too — `announceWorkspaceChange` is already the exact
  // signal for "something changed", so re-prime here instead of deep-comparing `data`'s
  // JSON on every render. `data` is a fresh object on every server render — including a
  // plain navigation between sibling trip pages where the underlying content hasn't changed
  // at all — so serializing the whole workspace (conversation history, itinerary, everything)
  // just to detect that costs real main-thread time for no reason.
  useEffect(() => subscribeWorkspaceChanges(() => {
    void router.refresh();
    if (typeof navigator !== "undefined" && navigator.onLine) void primeTrip(tripId);
  }), [router, tripId]);

  // Supabase Realtime re-broadcasts a collaborator's row changes onto that same
  // bus, and reports who else is here.
  const peers = useTripRealtime(tripId, me);

  // Prime once for the initial load too, not just subsequent changes.
  const hasData = Boolean(data);
  useEffect(() => {
    if (hasData && typeof navigator !== "undefined" && navigator.onLine) void primeTrip(tripId);
  }, [tripId, hasData]);

  // Stable across a presence-only re-render (peers updating doesn't change tripId/data/me), so
  // consumers of just this context bail out instead of re-rendering on every peer sync.
  const value = useMemo<TripDataValue>(() => ({ tripId, data, me }), [tripId, data, me]);

  return (
    <TripDataContext.Provider value={value}>
      <TripPresenceContext.Provider value={peers}>{children}</TripPresenceContext.Provider>
    </TripDataContext.Provider>
  );
}

export function useTripData(): TripDataValue {
  const value = useContext(TripDataContext);
  if (!value) throw new Error("useTripData must be used within a TripDataProvider");
  return value;
}

/** Like `useTripData` but returns null instead of throwing — for leaf components that also render in isolation (tests, storybook). */
export function useTripDataMaybe(): TripDataValue | null {
  return useContext(TripDataContext);
}

/** Collaborators currently viewing this trip (includes you) — split from `useTripData` so only
 *  the presence UI re-renders when someone joins or leaves. */
export function useTripPresence(): PresencePeer[] {
  return useContext(TripPresenceContext);
}
