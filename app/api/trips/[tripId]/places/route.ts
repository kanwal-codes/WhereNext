import { NextResponse } from "next/server";
import { z } from "zod";
import { placeSchema } from "@/packages/contracts/place";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPlaceRepository } from "@/features/places/infrastructure/placeRepository";
import { cached } from "@/lib/server/ttl-cache";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const query = new URL(request.url).searchParams.get("query")?.trim();
    if (!query) return NextResponse.json({ places: await createPlaceRepository(supabase).saved(tripId) });
    // maxResults 60 = Google's own ceiling across pages, so a "restaurants near X" browse doesn't stop at the first 20.
    const result = await cached(`places:search:${query.toLowerCase()}`, 300_000, async () => ({ places: await new GooglePlacesProvider().search(query, request.signal, 60), retrievedAt: new Date().toISOString() }));
    return NextResponse.json({ places: result.places, freshness: { provider: "google-places", retrievedAt: result.retrievedAt, cacheTtlSeconds: 300 } });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place search unavailable");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const place = placeSchema.parse(await request.json());
    const saved = await createPlaceRepository(supabase, createSupabaseAdminClient()).save(tripId, place);
    invalidateWorkspace(tripId);
    return NextResponse.json({ place: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid place" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Place could not be saved");
  }
}

async function placeAction(request: Request, tripId: string, status: "rejected" | "removed") {
  const { supabase } = await requireTripMember(tripId, { role: "editor" });
  const input = z.object({ providerId: z.string().min(1).max(240) }).parse(await request.json());
  const result = await supabase.from("places").select("id").eq("provider_id", input.providerId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return NextResponse.json({ error: "Place not found" }, { status: 404 });
  if (status === "rejected") {
    const update = await supabase.from("trip_places").upsert({ trip_id: tripId, place_id: result.data.id, status });
    if (update.error) throw update.error;
  } else {
    const removed = await supabase.from("trip_places").delete().eq("trip_id", tripId).eq("place_id", result.data.id);
    if (removed.error) throw removed.error;
  }
  invalidateWorkspace(tripId);
  return NextResponse.json({ [status]: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    return await placeAction(request, (await params).tripId, "rejected");
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid place" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Place could not be rejected");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    return await placeAction(request, (await params).tripId, "removed");
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid place" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Place could not be removed");
  }
}
