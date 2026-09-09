import { NextResponse } from "next/server";
import { availabilityInput } from "@/features/availability/domain/availability";
import { computeOverlaps } from "@/features/availability/domain/overlap";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

type Row = { id: string; user_id: string; start_date: string; end_date: string };

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const result = await supabase.from("trip_date_availability").select("id,user_id,start_date,end_date").eq("trip_id", tripId).order("start_date");
    if (result.error) throw result.error;
    const rows = (result.data ?? []) as Row[];
    const ranges = rows.map((r) => ({ id: r.id, userId: r.user_id, startDate: r.start_date, endDate: r.end_date }));
    const overlaps = computeOverlaps(ranges.map((r) => ({ userId: r.userId, startDate: r.startDate, endDate: r.endDate })));
    return NextResponse.json({ ranges, overlaps });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Availability unavailable");
  }
}

// Replaces the caller's own set of ranges — a full re-submit, not an incremental add, same
// "new ordering wholesale" semantics as the itinerary reorder endpoint. Only ever touches the
// caller's own rows; RLS also enforces this, but scoping the delete explicitly keeps the
// intent obvious here.
export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const parsed = availabilityInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid availability" }, { status: 400 });

    const del = await supabase.from("trip_date_availability").delete().eq("trip_id", tripId).eq("user_id", user.id);
    if (del.error) throw del.error;
    const rows = parsed.data.ranges.map((r) => ({ trip_id: tripId, user_id: user.id, start_date: r.startDate, end_date: r.endDate }));
    const inserted = await supabase.from("trip_date_availability").insert(rows).select("id,user_id,start_date,end_date");
    if (inserted.error) throw inserted.error;

    invalidateWorkspace(tripId);
    return NextResponse.json({ ranges: (inserted.data as Row[]).map((r) => ({ id: r.id, userId: r.user_id, startDate: r.start_date, endDate: r.end_date })) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Availability unavailable");
  }
}
