import { NextResponse } from "next/server";
import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { cached } from "@/lib/server/ttl-cache";

/** One place's full details, for someone with no trip open. Trips have their own at /api/trips/[tripId]/places/google. */
export const GET = withRoute(async (request: Request) => {
  try {
    await requireUser({ limit: LIMITS.provider });
    const placeId = new URL(request.url).searchParams.get("placeId");
    if (!placeId || placeId.length > 240) return NextResponse.json({ error: "Place ID required" }, { status: 400 });
    const result = await cached(`places:details:${placeId}`, 900_000, async () => ({ place: await new GooglePlacesProvider().details(placeId, request.signal), retrievedAt: new Date().toISOString() }));
    return NextResponse.json({ place: result.place, freshness: { provider: "google-places", retrievedAt: result.retrievedAt, cacheTtlSeconds: 900 } });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place details unavailable");
  }
});
