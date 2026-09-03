import { NextResponse } from "next/server";
import { z } from "zod";
import { placementRequestSchema } from "@/packages/contracts/placement";
import { canChangeLockedItem } from "@/features/itinerary/domain/item";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPlaceRepository } from "@/features/places/infrastructure/placeRepository";

/**
 * One control, one state machine: reconcile a place's shortlist row and its
 * itinerary row so they can't drift. A scheduled place is always also
 * shortlisted; removing it from a day leaves it shortlisted; "none" clears both.
 * The itinerary row is keyed by title (= place name), like every other
 * itinerary write in the app.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const { place, placement } = placementRequestSchema.parse(await request.json());
    const title = place.name.trim();

    // --- shortlist row -----------------------------------------------------
    if (placement === "none") {
      const row = await supabase.from("places").select("id").eq("provider_id", place.providerId).maybeSingle();
      if (row.error) throw row.error;
      if (row.data) {
        const del = await supabase.from("trip_places").delete().eq("trip_id", tripId).eq("place_id", row.data.id);
        if (del.error) throw del.error;
      }
    } else {
      // Upserts places + trip_places(status:saved) + the source row.
      await createPlaceRepository(supabase, createSupabaseAdminClient()).save(tripId, place);
    }

    // --- itinerary row ---------------------------------------------------
    const existing = await supabase.from("trip_itinerary_items").select("metadata").eq("trip_id", tripId).eq("title", title).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data && !canChangeLockedItem(existing.data.metadata as Record<string, unknown> | null, {})) {
      return NextResponse.json({ error: "Unlock the itinerary item before moving it." }, { status: 409 });
    }

    if (typeof placement === "object") {
      const up = await supabase.from("trip_itinerary_items").upsert(
        {
          trip_id: tripId,
          title,
          day_index: placement.dayIndex,
          removed_at: null,
          metadata: { source: "place", provider_id: place.providerId, latitude: place.latitude, longitude: place.longitude },
        },
        { onConflict: "trip_id,title" },
      );
      if (up.error) throw up.error;
    } else if (existing.data) {
      const del = await supabase.from("trip_itinerary_items").delete().eq("trip_id", tripId).eq("title", title);
      if (del.error) throw del.error;
    }

    return NextResponse.json({ placement });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid placement" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Placement could not be saved");
  }
}
