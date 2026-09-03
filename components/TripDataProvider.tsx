"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { useTripRealtime, type PresencePeer } from "@/lib/client/trip-realtime";
import { primeTrip } from "@/lib/client/offline-store";
import type { TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";

type TripDataValue = {
  tripId: string;
  /** Server-loaded snapshot; null in the credential-free `rebuild-preview` route. */
  data: TripWorkspaceData | null;
  /** Collaborators currently viewing this trip (includes you). */
  peers: PresencePeer[];
};

const TripDataContext = createContext<TripDataValue | null>(null);

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

  // Mutations across the app announce a change on the window event bus; route it
  // through Next's data refresh so server components re-render with fresh data.
  useEffect(() => subscribeWorkspaceChanges(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) navigator.serviceWorker.controller?.postMessage({ type: "invalidate-trip-workspace" });
    void router.refresh();
  }), [router]);

  // Supabase Realtime re-broadcasts a collaborator's row changes onto that same
  // bus, and reports who else is here.
  const peers = useTripRealtime(tripId, me);

  // Keep an offline mirror warm for the "Today" view.
  useEffect(() => {
    if (data && typeof navigator !== "undefined" && navigator.onLine) void primeTrip(tripId);
  }, [tripId, data]);

  return (
    <TripDataContext.Provider value={{ tripId, data, peers }}>
      {children}
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
