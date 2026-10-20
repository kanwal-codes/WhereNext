import { NextResponse } from "next/server";
import { z } from "zod";
import { placeSchema } from "@/packages/contracts/place";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPlaceRepository } from "@/features/places/infrastructure/placeRepository";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim();
    if (!query) return NextResponse.json({ places: await createPlaceRepository(supabase).saved(tripId) });
    // Optional — a caller with a real anchor point (e.g. a place-detail page's "around here"
    // lanes) passes it so Google biases toward that city instead of trusting the query text
    // alone (see LocationBias's doc comment for the live-found bug this fixes).
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const locationBias = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
    // maxResults 60 = Google's own ceiling across pages, so a "restaurants near X" browse doesn't
    // stop at the first 20. No cache here — `.search()` itself already caches by (query,
    // maxResults); a second cache layer on top of it, under a different key and a different TTL,
    // could never be invalidated in step with the one underneath it.
    // `limit` lets a caller that shows a handful (a detail view's "around here" lane) stop at one
    // page instead of paying for three sequential ones.
    const limit = Math.min(60, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 60)));
    const retrievedAt = new Date().toISOString();
    const places = await new GooglePlacesProvider().search(query, request.signal, limit, locationBias);
    return NextResponse.json({ places, freshness: { provider: "google-places", retrievedAt, cacheTtlSeconds: 60 } });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place search unavailable");
  }
});

export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
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
});

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

export const PATCH = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    return await placeAction(request, (await params).tripId, "rejected");
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid place" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Place could not be rejected");
  }
});

export const DELETE = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    return await placeAction(request, (await params).tripId, "removed");
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid place" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Place could not be removed");
  }
});
