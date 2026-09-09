import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail, withRoute } from "@/lib/server/with-route";
import { loadTripWorkspace } from "@/features/workspace/application/loadTripWorkspace";

export const GET = withRoute(async (_: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const workspace = await loadTripWorkspace(supabase, tripId, user.id);
    return workspace ? NextResponse.json(workspace) : NextResponse.json({ error: "Trip not found" }, { status: 404 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Workspace unavailable");
  }
});
