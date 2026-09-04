import { cache, type ReactNode } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTripMember } from "@/lib/server/trip-auth";
import { loadTripWorkspace, type TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";
import { TripShell, type ShellTrip } from "@/components/TripShell";
import { TripDataProvider } from "@/components/TripDataProvider";
import { TripPanelProvider } from "@/components/TripPanelProvider";
import { TripPanel } from "@/components/TripPanel";
import { tripCompleteness } from "@/lib/design";
import { workspaceTag } from "@/lib/server/workspace-cache";

const PREVIEW_ID = "rebuild-preview";
/** The credential-free preview trip exists for Playwright only; never in a real deployment. */
const previewEnabled = (tripId: string) => tripId === PREVIEW_ID && process.env.E2E_PREVIEW === "1";

// The trip's workspace snapshot is identical for every member, so it's cached
// across requests and busted by the `revalidateTag(workspaceTag(id))` the mutation
// routes fire. Membership is checked per-request with the cookie-bound client; the
// cached read itself uses the service client, because `unstable_cache` must not
// close over cookie-scoped state. `revalidate` is only a backstop for changes that
// bypass a mutation route — tag invalidation carries the normal case.
const loadWorkspaceCached = (tripId: string) =>
  unstable_cache(
    async () => loadTripWorkspace(createSupabaseAdminClient(), tripId).catch(() => null),
    ["trip-workspace", tripId],
    { revalidate: 120, tags: [workspaceTag(tripId)] },
  )();

// De-duped per request. Per-route <title> is handled client-side by `useDocumentTitle`
// (these routes are "use client" and can't export metadata) — the layout must NOT render
// a competing <title>, or React reconciliation clobbers the client-set one.
const getWorkspace = cache(async (tripId: string): Promise<TripWorkspaceData | null> => {
  try {
    await requireTripMember(tripId);
  } catch {
    return null; // no session, or not a member → notFound() upstream
  }
  try {
    return await loadWorkspaceCached(tripId);
  } catch {
    // Service role not configured — fall back to a per-request cookie-scoped read.
    const supabase = await createSupabaseServerClient();
    return loadTripWorkspace(supabase, tripId).catch(() => null);
  }
});

const getViewer = cache(async (): Promise<{ userId: string; name: string } | undefined> => {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return undefined;
  const meta = (user.user_metadata ?? {}) as { name?: string; full_name?: string };
  return { userId: user.id, name: meta.name || meta.full_name || user.email?.split("@")[0] || "Someone" };
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
        <TripPanelProvider tripId={tripId}>
          <TripShell tripId={tripId} trip={previewTrip}>{children}</TripShell>
          <TripPanel layout="drawer" />
        </TripPanelProvider>
      </TripDataProvider>
    );
  }

  const data = await getWorkspace(tripId);
  if (!data) notFound();
  const me = await getViewer();

  return (
    <TripDataProvider tripId={tripId} data={data} me={me}>
      <TripPanelProvider tripId={tripId}>
        <TripShell tripId={tripId} trip={shellFromData(data)}>{children}</TripShell>
        <TripPanel layout="drawer" />
      </TripPanelProvider>
    </TripDataProvider>
  );
}
