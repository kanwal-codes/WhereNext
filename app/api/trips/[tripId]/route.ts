import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";

/** Delete a whole trip. Owner only; the DB cascades places, itinerary, conversation, decisions. */
export async function DELETE(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "owner" });
    // `.select()` so a row-level-security denial (which returns 0 rows and no
    // error) surfaces as a failure instead of a false 204.
    const result = await supabase.from("trips").delete().eq("id", tripId).select("id");
    if (result.error) throw result.error;
    if (!result.data || result.data.length === 0) {
      return NextResponse.json({ error: "Trip could not be deleted" }, { status: 500 });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Trip could not be deleted" }, { status: 503 });
  }
}
