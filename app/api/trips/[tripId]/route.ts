import { NextResponse } from "next/server";
import { z } from "zod";
import { isoDate, tripDurationDays } from "@/features/trip/domain/trip";
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

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    destination: z.string().trim().min(1).max(160).optional(),
    origin: z.string().trim().max(160).nullable().optional(),
    // null clears the field; a date sets it.
    startDate: isoDate.nullable().optional(),
    endDate: isoDate.nullable().optional(),
    travelerCount: z.coerce.number().int().min(1).max(100).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });

/** Edit trip identity after creation — used by the trip-context panel and the conversation's date confirm. */
export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid trip update" }, { status: 400 });
    const body = parsed.data;

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.destination !== undefined) update.destination = body.destination;
    if (body.origin !== undefined) update.origin = body.origin;
    if (body.travelerCount !== undefined) update.travelers = body.travelerCount;

    // Dates move as a pair: recompute duration_days whenever either side changes.
    if (body.startDate !== undefined || body.endDate !== undefined) {
      const current = await supabase.from("trips").select("start_date,end_date").eq("id", tripId).maybeSingle();
      if (current.error) throw current.error;
      const start = body.startDate !== undefined ? body.startDate : (current.data?.start_date ?? null);
      const end = body.endDate !== undefined ? body.endDate : (current.data?.end_date ?? null);
      if (start && end && end < start) return NextResponse.json({ error: "End date is before the start date." }, { status: 400 });
      update.start_date = start;
      update.end_date = end;
      const derived = tripDurationDays(start, end);
      if (derived) update.duration_days = derived;
    }

    const result = await supabase.from("trips").update(update).eq("id", tripId).select("id,name,destination,origin,duration_days,start_date,end_date,travelers").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ error: "Trip could not be updated" }, { status: 500 });
    return NextResponse.json({ trip: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid trip update" }, { status: 400 });
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Trip could not be updated" }, { status: 503 });
  }
}
