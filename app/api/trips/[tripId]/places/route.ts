import { NextResponse } from "next/server";
import { z } from "zod";
import { placeSchema } from "@/packages/contracts/place";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPlaceRepository } from "@/features/places/infrastructure/placeRepository";
import { cached } from "@/lib/server/ttl-cache";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const query = new URL(request.url).searchParams.get("query")?.trim();
    if (!query) return NextResponse.json({ places: await createPlaceRepository(supabase).saved(tripId) });
    const result = await cached(`places:search:${query.toLowerCase()}`, 300_000, async () => ({ places: await new GooglePlacesProvider().search(query, request.signal), retrievedAt: new Date().toISOString() }));
    return NextResponse.json({ places: result.places, freshness: { provider: "google-places", retrievedAt: result.retrievedAt, cacheTtlSeconds: 300 } });
  } catch (error) {
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Place search unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const place = placeSchema.parse(await request.json());
    return NextResponse.json({ place: await createPlaceRepository(supabase, createSupabaseAdminClient()).save(tripId, place) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid place" }, { status: 400 });
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Place could not be saved" }, { status: 503 });
  }
}

async function placeAction(request: Request, tripId: string, status: "rejected" | "removed") {
  const { supabase } = await requireTripMember(tripId);
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
  return NextResponse.json({ [status]: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    return await placeAction(request, (await params).tripId, "rejected");
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid place" }, { status: 400 });
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Place could not be rejected" }, { status: 503 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    return await placeAction(request, (await params).tripId, "removed");
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid place" }, { status: 400 });
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Place could not be removed" }, { status: 503 });
  }
}
