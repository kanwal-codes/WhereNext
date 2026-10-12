import { NextResponse } from "next/server";
import { lockDatesInput } from "@/features/availability/domain/availability";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { countBookingsOutside } from "@/lib/server/bookings-outside-dates";
import { parseStops, shiftStops } from "@/lib/trip-stops";

// The explicit-UI twin of the write path app/api/ai/route.ts already uses from the
// conversational side (buildTripRowUpdate / withExplicitDestination both write these same
// nullable columns) — locking dates here is just a direct, deliberate version of that same
// write, not a new concept. No trip_decisions row: unlike the stay-lock precedent, dates
// already have first-class columns on trips.
export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const parsed = lockDatesInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid dates" }, { status: 400 });

    const current = await supabase.from("trips").select("start_date,end_date,stops").eq("id", tripId).maybeSingle();
    if (current.error) throw current.error;
    const moved = shiftStops(parseStops(current.data?.stops), current.data?.start_date ?? null, parsed.data.startDate, current.data?.end_date ?? null, parsed.data.endDate);
    const result = await supabase
      .from("trips")
      .update({ start_date: parsed.data.startDate, end_date: parsed.data.endDate, ...(moved ? { stops: moved } : {}) })
      .eq("id", tripId)
      .select("start_date,end_date")
      .single();
    if (result.error) throw result.error;

    invalidateWorkspace(tripId);
    return NextResponse.json({ startDate: result.data.start_date, endDate: result.data.end_date, bookingsOutsideDates: await countBookingsOutside(supabase, tripId, result.data.start_date, result.data.end_date) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Couldn’t lock these dates");
  }
}
