import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { cached } from "@/lib/server/ttl-cache";
import { withinRateLimit } from "@/lib/server/rate-limit";

/** Typeahead for a place field, e.g. `?query=Lisb`. Cities and regions by default; `scope=areas` adds neighbourhoods; `scope=places` is any place (stations, airports, parks, addresses). Both rank toward `near=lat,lng`. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { user } = await requireTripMember(tripId);
    // Beyond the result cache below, nothing else caps this — a scripted account could still
    // drive real per-request Google Places billing. Generous, since real typing fires this
    // once per keystroke past the debounce.
    if (!(await withinRateLimit(`autocomplete:${user.id}`, 60, 60_000))) {
      return NextResponse.json({ error: "Too many searches. Try again in a moment." }, { status: 429 });
    }
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim();
    if (!query || query.length < 2) return NextResponse.json({ suggestions: [] });
    const scope = url.searchParams.get("scope");
    if (scope === "places" || scope === "areas") {
      const [lat, lng] = (url.searchParams.get("near") ?? "").split(",").map(Number);
      const near = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : undefined;
      const key = `places:autocomplete:${scope}:${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : "-"}:${query.toLowerCase()}`;
      const provider = new GooglePlacesProvider();
      return NextResponse.json({ suggestions: await cached(key, 60_000, () => (scope === "areas" ? provider.autocompleteAreas(query, request.signal, near) : provider.autocompletePlaces(query, request.signal, near))) });
    }
    const suggestions = await cached(`places:autocomplete:${query.toLowerCase()}`, 60_000, () => new GooglePlacesProvider().autocompleteRegions(query, request.signal));
    return NextResponse.json({ suggestions });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Destination search unavailable");
  }
}
