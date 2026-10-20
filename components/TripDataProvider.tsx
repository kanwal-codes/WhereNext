"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { subscribeWorkspaceChanges, type WorkspaceChange } from "@/lib/application/workspace-events";
import { useTripRealtime, type PresencePeer } from "@/lib/client/trip-realtime";
import { primeTrip } from "@/lib/client/offline-store";
import type { TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";
import { useGuest } from "@/features/identity/ui/GuestProvider";

type TripDataValue = {
  tripId: string;
  /** Server-loaded snapshot; null in the credential-free `rebuild-preview` route. */
  data: TripWorkspaceData | null;
  /** The signed-in viewer; undefined only in the credential-free `rebuild-preview` route. */
  me?: { userId: string; name: string };
};

const TripDataContext = createContext<TripDataValue | null>(null);

/** The change types that alter what the trip layout renders on the server (the workspace snapshot). */
const SERVER_RENDERED = new Set<WorkspaceChange>(["trip", "preferences", "decision", "itinerary", "places", "essentials"]);
// Presence (who's viewing right now) changes far more often than the trip data itself — its own
// context so a collaborator's presence ping doesn't re-render every consumer of `useTripData()`
// (the map, Roam, the trip panel, the itinerary, Discover...), only the one component that
// actually shows who's here.
const TripPresenceContext = createContext<PresencePeer[]>([]);

/** Run background work once the page has had its moment: after `delay`, and only when the browser is idle.
 *  The offline mirror downloads the whole workspace, the static map and place photos; started on mount it
 *  competed with the page's own requests, which is a large part of why every click felt slow. */
function afterQuiet(fn: () => void, delay: number): () => void {
  let idle = 0;
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  const timer = window.setTimeout(() => {
    if (w.requestIdleCallback) idle = w.requestIdleCallback(fn, { timeout: 10_000 });
    else fn();
  }, delay);
  return () => {
    clearTimeout(timer);
    if (idle && w.cancelIdleCallback) w.cancelIdleCallback(idle);
  };
}

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
  // A guest has no offline copy to keep warm (those routes are closed to guests).
  const { guest } = useGuest();

  // Mutations across the app announce a change on the window event bus; route it through
  // Next's data refresh so server components re-render with fresh data, and keep the offline
  // mirror for the "Today" view warm too — `announceWorkspaceChange` is already the exact
  // signal for "something changed", so re-prime here instead of deep-comparing `data`'s
  // JSON on every render. `data` is a fresh object on every server render — including a
  // plain navigation between sibling trip pages where the underlying content hasn't changed
  // at all — so serializing the whole workspace (conversation history, itinerary, everything)
  // just to detect that costs real main-thread time for no reason.
  useEffect(() => {
    // Leading + trailing throttle: the first change refreshes at once, a flurry after it collapses into ONE more
    // refresh 1.5 s later. Each refresh is a server render of the whole trip; unthrottled, a burst of realtime
    // events (or a few quick edits) stacked a dozen of them.
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      last = Date.now();
      void router.refresh();
    };
    const unsubscribe = subscribeWorkspaceChanges((changes) => {
      // Only what the server renders is worth a server render. A group message, a member, an expense: each
      // screen showing one fetches it on its own signal, and the busiest of them (every message a friend
      // sends) was re-rendering the whole trip for nothing.
      if (!changes.some((change) => SERVER_RENDERED.has(change))) return;
      const since = Date.now() - last;
      if (since >= 1500) run();
      else if (!trailing) trailing = setTimeout(() => { trailing = null; run(); }, 1500 - since);
    });
    return () => {
      unsubscribe();
      if (trailing) clearTimeout(trailing);
    };
  }, [router]);

  // Supabase Realtime re-broadcasts a collaborator's row changes onto that same
  // bus, and reports who else is here.
  const peers = useTripRealtime(tripId, me);

  // Mirror the workspace the server just rendered: on the first load, and again each time a change's refresh brings new data.
  // It reads `data` itself, so keeping the offline copy warm costs no extra request.
  useEffect(() => {
    if (!guest && data && typeof navigator !== "undefined" && navigator.onLine) return afterQuiet(() => void primeTrip(tripId, data), 4000);
  }, [tripId, data, guest]);

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
