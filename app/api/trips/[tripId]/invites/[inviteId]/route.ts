import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";

/** Revoke a not-yet-accepted invite link. Any member. */
export async function DELETE(_: Request, { params }: { params: Promise<{ tripId: string; inviteId: string }> }) {
  try {
    const { tripId, inviteId } = await params;
    const { supabase } = await requireTripMember(tripId);
    // `.select()` so revoking an invite that's already gone (already accepted, expired and
    // swept, or never existed) surfaces as a real "not found" instead of a false success —
    // same shape as the trip DELETE route's own row-count check.
    const deleted = await supabase.from("trip_invites").delete().eq("id", inviteId).eq("trip_id", tripId).select("id");
    if (deleted.error) throw deleted.error;
    if (!deleted.data || deleted.data.length === 0) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "The invite couldn’t be revoked.");
  }
}
