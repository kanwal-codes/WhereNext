import { NextResponse } from "next/server";
import { z } from "zod";
import { placementRequestSchema } from "@/packages/contracts/placement";
import { canChangeLockedItem } from "@/features/itinerary/domain/item";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPlaceRepository } from "@/features/places/infrastructure/placeRepository";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

/**
 * Updates a place's itinerary placement. Saved places are managed separately
 * by the bookmark endpoint. The itinerary row is keyed by title (= place name),
 * like every other itinerary write in the app.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const { place, placement } = placementRequestSchema.parse(await request.json());
    const title = place.name.trim();

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
    } else {
      if (placement === "shortlist") {
        await createPlaceRepository(supabase, createSupabaseAdminClient()).save(tripId, place);
      }
      if (placement === "none" && existing.data) {
        const del = await supabase.from("trip_itinerary_items").delete().eq("trip_id", tripId).eq("title", title);
        if (del.error) throw del.error;
      }
    }

    invalidateWorkspace(tripId);
    return NextResponse.json({ placement });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid placement" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Placement could not be saved");
  }
}
