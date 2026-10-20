import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";

// How many group messages from other people the viewer has not seen (group_chat_reads, migration 0049).
export const GET = withRoute(async (_request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { registered: true });
    const { data, error } = await supabase.rpc("group_chat_unread", { p_trip_id: tripId });
    if (error) throw error;
    return NextResponse.json({ count: typeof data === "number" ? data : 0 }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Unread count unavailable");
  }
});

// The viewer has the group chat open: everything up to now is read.
export const POST = withRoute(async (_request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { registered: true });
    const { error } = await supabase
      .from("group_chat_reads")
      .upsert({ trip_id: tripId, user_id: user.id, last_read_at: new Date().toISOString() }, { onConflict: "trip_id,user_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Could not mark the chat as read");
  }
});
