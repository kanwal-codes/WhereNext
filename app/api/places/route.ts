import { NextResponse } from "next/server";
import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";

/** Place search for someone with no trip open (the Eat tool on the home page). Trips have their own at /api/trips/[tripId]/places. */
export const GET = withRoute(async (request: Request) => {
  try {
    await requireUser({ limit: LIMITS.provider });
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim();
    if (!query || query.length > 200) return NextResponse.json({ error: "Say what to look for" }, { status: 400 });
    const limit = Math.min(60, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 60)));
    // With a position ("around me"), Google ranks toward it instead of trusting the words alone.
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const bias = url.searchParams.has("lat") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : undefined;
    // The price level always comes (it is what the Price pill is made of); `hours=1` also fetches each place's weekly opening hours, for a search that has a date or time to check them against.
    const places = await new GooglePlacesProvider().search(query, request.signal, limit, bias, { hours: url.searchParams.get("hours") === "1", price: true });
    return NextResponse.json({ places, freshness: { provider: "google-places", retrievedAt: new Date().toISOString(), cacheTtlSeconds: 60 } });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place search unavailable");
  }
});
