import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { committedTotals } from "@/lib/server/committed";
import { resolveCurrency } from "@/lib/currency";
import { readStayDecision } from "@/packages/contracts/stay";
import { RESERVATION_COLUMNS, toReservation } from "@/packages/contracts/reservation";

/**
 * What the group has booked so far, in the trip's own currency where a rate exists. Hand-entered
 * bookings can be in any currency (a Rome hotel in euros, a London one in pounds): converted at the
 * day's reference rate, with whatever cannot be converted listed as it was priced.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const [reservations, trip, prefs, decisions] = await Promise.all([
      supabase.from("trip_reservations").select(RESERVATION_COLUMNS).eq("trip_id", tripId),
      supabase.from("trips").select("travelers").eq("id", tripId).maybeSingle(),
      supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
      supabase.from("trip_decisions").select("kind,value,source,created_at").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(30),
    ]);
    const error = reservations.error ?? trip.error ?? prefs.error ?? decisions.error;
    if (error) throw error;
    const travellers = (trip.data?.travelers as number | null) ?? null;
    const home = resolveCurrency((prefs.data?.data ?? null) as Record<string, unknown> | null);
    return NextResponse.json(await committedTotals((reservations.data ?? []).map(toReservation), readStayDecision(decisions.data ?? []), travellers, home, request.signal));
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "The budget is unavailable right now.");
  }
}
