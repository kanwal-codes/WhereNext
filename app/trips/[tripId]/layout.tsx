import { cache, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTripWorkspace, type TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";
import { TripShell, type ShellTrip } from "@/components/TripShell";
import { TripDataProvider } from "@/components/TripDataProvider";
import { tripCompleteness } from "@/lib/design";

const PREVIEW_ID = "rebuild-preview";
/** The credential-free preview trip exists for Playwright only; never in a real deployment. */
const previewEnabled = (tripId: string) => tripId === PREVIEW_ID && process.env.E2E_PREVIEW === "1";

// De-duped per request. Per-route <title> is handled client-side by `useDocumentTitle`
// (these routes are "use client" and can't export metadata) — the layout must NOT render
// a competing <title>, or React reconciliation clobbers the client-set one.
const getWorkspace = cache(async (tripId: string): Promise<TripWorkspaceData | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? await loadTripWorkspace(supabase, tripId).catch(() => null) : null;
});

function shellFromData(data: TripWorkspaceData): ShellTrip {
  const { trip } = data;
  return {
    name: trip.name,
    destination: trip.destination,
    dates: trip.duration_days ? `${trip.duration_days} days` : "Dates open",
    travellers: trip.travelers ? `${trip.travelers} traveller${trip.travelers === 1 ? "" : "s"}` : "Travellers open",
    progress: tripCompleteness({
      preferences: data.preferences,
      savedPlaces: data.savedPlaces,
      itinerary: data.itinerary,
      decisions: data.decisions,
      conversation: data.conversation,
      essentials: data.essentials,
    }),
  };
}

export default async function TripLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  if (previewEnabled(tripId)) {
    const previewTrip: ShellTrip = { name: "Preview trip", destination: "your destination", dates: "Dates open", travellers: "Travellers open", progress: 0 };
    return (
      <TripDataProvider tripId={tripId} data={null}>
        <TripShell tripId={tripId} trip={previewTrip}>{children}</TripShell>
      </TripDataProvider>
    );
  }

  const data = await getWorkspace(tripId);
  if (!data) notFound();

  return (
    <TripDataProvider tripId={tripId} data={data}>
      <TripShell tripId={tripId} trip={shellFromData(data)}>{children}</TripShell>
    </TripDataProvider>
  );
}
