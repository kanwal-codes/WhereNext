import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { toBooking } from "@/packages/contracts/booking";

export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const result = await supabase
      .from("bookings")
      .select("id,kind,provider,status,provider_reference,confirmation_code,currency,total_amount,created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return NextResponse.json({ bookings: result.data.map(toBooking) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Bookings are unavailable right now");
  }
});
