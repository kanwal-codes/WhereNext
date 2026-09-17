import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail, withRoute } from "@/lib/server/with-route";
import { loadTripWorkspace } from "@/features/workspace/application/loadTripWorkspace";
import { loadWorkspaceCached } from "@/lib/server/workspace-cache";

// Hit by the client's offline-mirror priming on every mount and after every mutation — this
// used to always read straight from the database, bypassing the same cache the trip layout
// already reads through (and that every mutation route already busts via `revalidateTag`), so
// a mutation triggered two full DB reads back to back: the page's own re-render, and this.
export const GET = withRoute(async (_: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const workspace = await loadWorkspaceCached(tripId, user.id).catch(() =>
      // Service role not configured — same per-request cookie-scoped fallback the layout uses.
      loadTripWorkspace(supabase, tripId, user.id),
    );
    return workspace ? NextResponse.json(workspace) : NextResponse.json({ error: "Trip not found" }, { status: 404 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Workspace unavailable");
  }
});
