import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { RESERVATION_COLUMNS, reservationInput, toReservation, toReservationRow } from "@/packages/contracts/reservation";

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const result = await supabase
      .from("trip_reservations")
      .select(RESERVATION_COLUMNS)
      .eq("trip_id", tripId)
      .order("starts_on", { ascending: true, nullsFirst: false })
      .order("start_time", { ascending: true, nullsFirst: false });
    if (result.error) throw result.error;
    return NextResponse.json({ reservations: result.data.map(toReservation) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Reservations are unavailable right now");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { role: "editor" });
    const parsed = reservationInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid reservation" }, { status: 400 });
    const result = await supabase
      .from("trip_reservations")
      .insert({ trip_id: tripId, created_by: user.id, ...toReservationRow(parsed.data) })
      .select(RESERVATION_COLUMNS)
      .single();
    if (result.error) throw result.error;
    return NextResponse.json({ reservation: toReservation(result.data) }, { status: 201 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "That reservation couldn't be saved");
  }
}
