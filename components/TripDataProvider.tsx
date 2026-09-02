"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import type { TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";

type TripDataValue = {
  tripId: string;
  /** Server-loaded snapshot; null in the credential-free `rebuild-preview` route. */
  data: TripWorkspaceData | null;
};

const TripDataContext = createContext<TripDataValue | null>(null);

export function TripDataProvider({
  tripId,
  data,
  children,
}: {
  tripId: string;
  data: TripWorkspaceData | null;
  children: ReactNode;
}) {
  const router = useRouter();

  // Mutations across the app announce a change on the window event bus; route it
  // through Next's data refresh so server components re-render with fresh data.
  useEffect(() => subscribeWorkspaceChanges(() => router.refresh()), [router]);

  return (
    <TripDataContext.Provider value={{ tripId, data }}>
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
