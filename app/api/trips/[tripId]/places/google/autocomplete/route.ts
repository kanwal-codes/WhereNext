import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { cached } from "@/lib/server/ttl-cache";
import { withinRateLimit } from "@/lib/server/rate-limit";

/** City/region typeahead for the destination field, e.g. `?query=Lisb`. */
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
    const query = new URL(request.url).searchParams.get("query")?.trim();
    if (!query || query.length < 2) return NextResponse.json({ suggestions: [] });
    const suggestions = await cached(`places:autocomplete:${query.toLowerCase()}`, 60_000, () => new GooglePlacesProvider().autocompleteRegions(query, request.signal));
    return NextResponse.json({ suggestions });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Destination search unavailable");
  }
}
