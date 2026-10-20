import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { cached } from "@/lib/server/ttl-cache";
import { research } from "@/packages/providers/tavily/client";
import { cityFrom, type GooglePlaceDetails } from "@/lib/places-ui";
import { cleanExcerpt, isScrapeJunk } from "@/lib/server/place-excerpt";
import { writePlaceAbout, type AboutSnippet, type PlaceAbout } from "@/lib/application/place-about";

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Web text that is at least about this place (its name appears) and is not page chrome. A false negative only means less to write from. */
async function webSnippets(placeId: string, name: string, city: string, signal?: AbortSignal): Promise<AboutSnippet[]> {
  try {
    const results = await cached(`places:web-summary:${placeId}`, 24 * 60 * 60_000, () => research(`"${name}"${city ? ` ${city}` : ""} review what it's like`, signal));
    const wanted = normalize(name);
    return results
      .filter((r) => r.content.length > 40 && !isScrapeJunk(r.content) && normalize(`${r.title} ${r.content}`).includes(wanted))
      .map((r) => ({ title: r.title, url: r.url, content: cleanExcerpt(r.content) }))
      .filter((r) => r.content.length > 40);
  } catch {
    return [];
  }
}

/**
 * The "About" blurb for a place, written from the listing and the web rather than copied from it (see place-about.ts).
 * Its own route so the page shows the place at once and the blurb arrives after; kept a day, since what a place is
 * known for barely changes.
 */
export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId, { limit: LIMITS.llm });
    const placeId = new URL(request.url).searchParams.get("placeId");
    if (!placeId) return NextResponse.json({ error: "Place ID required" }, { status: 400 });
    const about = await cached<{ about: PlaceAbout | null }>(`places:about:v2:${placeId}`, 24 * 60 * 60_000, async () => {
      const place = (await new GooglePlacesProvider().details(placeId)) as GooglePlaceDetails | null;
      if (!place?.displayName?.text) return { about: null };
      const snippets = await webSnippets(placeId, place.displayName.text, cityFrom(place.formattedAddress));
      return { about: await writePlaceAbout({ place, snippets }) };
    });
    return NextResponse.json(about);
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place details unavailable");
  }
});
