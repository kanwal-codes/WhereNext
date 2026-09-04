import { NextResponse } from "next/server";
import { z } from "zod";
import { placeSchema } from "@/packages/contracts/place";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPlaceRepository } from "@/features/places/infrastructure/placeRepository";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

const requestSchema = z.object({ place: placeSchema, saved: z.boolean() });

/** Toggle the saved/bookmarked relationship without changing itinerary placement. */
export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const { place, saved } = requestSchema.parse(await request.json());

    if (saved) {
      await createPlaceRepository(supabase, createSupabaseAdminClient()).save(tripId, place);
    } else {
      const row = await supabase
        .from("places")
        .select("id")
        .eq("provider", place.provider)
        .eq("provider_id", place.providerId)
        .maybeSingle();
      if (row.error) throw row.error;
      if (row.data) {
        const removed = await supabase.from("trip_places").delete().eq("trip_id", tripId).eq("place_id", row.data.id);
        if (removed.error) throw removed.error;
      }
    }

    invalidateWorkspace(tripId);
    return NextResponse.json({ saved });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid bookmark request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Bookmark could not be updated");
  }
}
