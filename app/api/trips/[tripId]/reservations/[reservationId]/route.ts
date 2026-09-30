import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { RESERVATION_FILES_BUCKET } from "@/lib/reservation-files";
import { RESERVATION_COLUMNS, readAttachments, reservationInput, toReservation, toReservationRow } from "@/packages/contracts/reservation";

type Ctx = { params: Promise<{ tripId: string; reservationId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { tripId, reservationId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const parsed = reservationInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid reservation" }, { status: 400 });
    const result = await supabase
      .from("trip_reservations")
      .update(toReservationRow(parsed.data))
      .eq("trip_id", tripId)
      .eq("id", reservationId)
      .select(RESERVATION_COLUMNS)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    return NextResponse.json({ reservation: toReservation(result.data) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "That reservation couldn't be saved");
  }
}

export async function DELETE(_: Request, { params }: Ctx) {
  try {
    const { tripId, reservationId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    // Take the attached files out of storage too, so a removed reservation leaves nothing behind.
    const existing = await supabase.from("trip_reservations").select("attachments").eq("trip_id", tripId).eq("id", reservationId).maybeSingle();
    const paths = readAttachments(existing.data?.attachments).map((f) => f.path);
    if (paths.length > 0) await supabase.storage.from(RESERVATION_FILES_BUCKET).remove(paths);
    const result = await supabase.from("trip_reservations").delete().eq("trip_id", tripId).eq("id", reservationId);
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "That reservation couldn't be removed");
  }
}
