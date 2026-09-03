import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { cached } from "@/lib/server/ttl-cache";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId);
    const placeId = new URL(request.url).searchParams.get("placeId");
    if (!placeId) return NextResponse.json({ error: "Place ID required" }, { status: 400 });
    const result = await cached(`places:details:${placeId}`, 900_000, async () => ({ place: await new GooglePlacesProvider().details(placeId, request.signal), retrievedAt: new Date().toISOString() }));
    return NextResponse.json({ place: result.place, freshness: { provider: "google-places", retrievedAt: result.retrievedAt, cacheTtlSeconds: 900 } });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place details unavailable");
  }
}
