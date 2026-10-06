import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { cached } from "@/lib/server/ttl-cache";

/** Resolve a free-text place to a single { lng, lat } — used to centre the Browse map. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    await requireTripMember((await params).tripId, { limit: LIMITS.provider });
    if (!process.env.GOOGLE_MAPS_API_KEY) return NextResponse.json({ error: "Geocoding is not configured" }, { status: 503 });
    const q = new URL(request.url).searchParams.get("q")?.trim();
    if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });
    const point = await cached(`geocode:point:${q.toLowerCase()}`, 24 * 60 * 60_000, async () => {
      const hit = (await new GooglePlacesProvider().search(q, request.signal))[0];
      return hit ? { lng: hit.longitude, lat: hit.latitude } : null;
    });
    return point ? NextResponse.json(point) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Geocoding is unavailable right now");
  }
}
