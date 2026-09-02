import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { loadTripWorkspace } from "@/features/workspace/application/loadTripWorkspace";

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const workspace = await loadTripWorkspace(supabase, tripId);
    return workspace ? NextResponse.json(workspace) : NextResponse.json({ error: "Trip not found" }, { status: 404 });
  } catch (error) {
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Workspace unavailable" }, { status: 503 });
  }
}
