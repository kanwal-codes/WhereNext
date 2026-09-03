import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { cached } from "@/lib/server/ttl-cache";
import { loadTripContext } from "@/lib/application/trip-context";
import { reviewTrip } from "@/lib/application/trip-review";

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const findings = await cached(`review:${tripId}`, 600_000, async () => {
      const ctx = await loadTripContext(supabase, tripId);
      return reviewTrip(ctx);
    });

    // Drop anything the traveller has already dismissed.
    const dismissed = await supabase.from("trip_decisions").select("value").eq("trip_id", tripId).eq("kind", "review_dismissed");
    if (dismissed.error) throw dismissed.error;
    const hidden = new Set((dismissed.data ?? []).map((d) => (d.value as { id?: string })?.id).filter(Boolean));
    return NextResponse.json({ findings: findings.filter((f) => !hidden.has(f.id)) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "The trip review is unavailable right now.");
  }
}
