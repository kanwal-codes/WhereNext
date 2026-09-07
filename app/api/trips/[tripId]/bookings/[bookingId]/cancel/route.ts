import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { cancelOrder } from "@/packages/providers/duffel/client";
import { cancelBooking } from "@/packages/providers/liteapi/client";
import { toBooking } from "@/packages/contracts/booking";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string; bookingId: string }> }) {
  try {
    const { tripId, bookingId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });

    const existing = await supabase
      .from("bookings")
      .select("id,kind,provider,status,provider_reference,confirmation_code,currency,total_amount,created_at")
      .eq("trip_id", tripId)
      .eq("id", bookingId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (existing.data.status === "cancelled") return NextResponse.json({ booking: toBooking(existing.data) });
    if (!existing.data.provider_reference) return NextResponse.json({ error: "This booking has no provider reference to cancel" }, { status: 409 });

    if (existing.data.provider === "duffel") await cancelOrder(existing.data.provider_reference, request.signal);
    else await cancelBooking(existing.data.provider_reference, request.signal);

    const result = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId)
      .select("id,kind,provider,status,provider_reference,confirmation_code,currency,total_amount,created_at")
      .single();
    if (result.error) throw result.error;
    invalidateWorkspace(tripId);
    return NextResponse.json({ booking: toBooking(result.data) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Cancellation failed — try again in a moment");
  }
}
