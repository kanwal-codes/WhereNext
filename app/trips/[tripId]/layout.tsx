import { cache, type ReactNode } from "react";
import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTripMember, TripAuthError } from "@/lib/server/trip-auth";
import { loadTripWorkspace, type TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";
import { TripShell, type ShellTrip } from "@/components/TripShell";
import { TripAtmosphere } from "@/components/TripAtmosphere";
import { TripDataProvider } from "@/components/TripDataProvider";
import { TripPanelProvider } from "@/components/TripPanelProvider";
import { TripPanel } from "@/components/TripPanel";
import { loadWorkspaceCached } from "@/lib/server/workspace-cache";
import { GuestProvider } from "@/features/identity/ui/GuestProvider";

const PREVIEW_ID = "rebuild-preview";
/** The credential-free preview trip exists for Playwright only; never in a real deployment. */
const previewEnabled = (tripId: string) => tripId === PREVIEW_ID && process.env.E2E_PREVIEW === "1";

// De-duped per request. Per-route <title> is handled client-side by `useDocumentTitle`
// (these routes are "use client" and can't export metadata) — the layout must NOT render
// a competing <title>, or React reconciliation clobbers the client-set one.
//
// Returns the authenticated `user` alongside the workspace data so the caller can derive the
// viewer from it directly — this used to be a second, independent auth.getUser() round-trip
// (getViewer, below) sequenced strictly after this one finished, even though it needed none of
// this function's result. requireTripMember already resolves the same user this needed.
const getWorkspace = cache(async (tripId: string): Promise<{ data: TripWorkspaceData; user: User } | null> => {
  let user: User;
  try {
    ({ user } = await requireTripMember(tripId));
  } catch (error) {
    if (error instanceof TripAuthError) return null; // no session, or not a member → notFound() upstream
    throw error; // a genuine outage must not read as "trip doesn't exist"
  }
  let data: TripWorkspaceData | null;
  try {
    data = await loadWorkspaceCached(tripId, user.id);
  } catch {
    // Service role not configured — fall back to a per-request cookie-scoped read. Membership is
    // already confirmed above, so any error past this point is a load failure, not a missing
    // trip — let it propagate to app/trips/[tripId]/error.tsx rather than a false notFound().
    const supabase = await createSupabaseServerClient();
    data = await loadTripWorkspace(supabase, tripId, user.id);
  }
  return data ? { data, user } : null;
});

function viewerFromUser(user: User): { userId: string; name: string } {
  const meta = (user.user_metadata ?? {}) as { name?: string; full_name?: string };
  return { userId: user.id, name: meta.name || meta.full_name || user.email?.split("@")[0] || "Someone" };
}

function shellFromData(data: TripWorkspaceData): ShellTrip {
  const { trip } = data;
  return {
    name: trip.name,
    destination: trip.destination || "Your next place",
    dates: trip.duration_days ? `${trip.duration_days} days` : "Dates open",
    travellers: trip.travelers ? `${trip.travelers} traveller${trip.travelers === 1 ? "" : "s"}` : "Travellers open",
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
    const previewTrip: ShellTrip = { name: "Preview trip", destination: "your destination", dates: "Dates open", travellers: "Travellers open" };
    return (
      <TripDataProvider tripId={tripId} data={null}>
        <TripPanelProvider tripId={tripId}>
          <TripShell tripId={tripId} trip={previewTrip}>{children}</TripShell>
          <TripPanel layout="drawer" />
        </TripPanelProvider>
      </TripDataProvider>
    );
  }

  const result = await getWorkspace(tripId);
  if (!result) notFound();
  const { data, user } = result;
  const me = viewerFromUser(user);

  const startDate = (data.trip as { start_date?: string | null }).start_date;
  const tripMonth = startDate ? new Date(`${startDate}T00:00:00`).getMonth() : null;

  return (
    <GuestProvider guest={user.is_anonymous === true} tripId={tripId}>
      <TripDataProvider tripId={tripId} data={data} me={me}>
        <TripPanelProvider tripId={tripId}>
          <TripAtmosphere destination={data.trip.destination} month={tripMonth} />
          <TripShell tripId={tripId} trip={shellFromData(data)}>{children}</TripShell>
          <TripPanel layout="drawer" />
        </TripPanelProvider>
      </TripDataProvider>
    </GuestProvider>
  );
}
