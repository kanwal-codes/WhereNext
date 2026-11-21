import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { AI_TEXT_TTL_MS, cached } from "@/lib/server/ttl-cache";
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
 * The "About" blurb for a place, written from the listing and the web rather than copied from it (see place-about.ts), kept a week
 * (AI_TEXT_TTL_MS), since what a place is known for barely changes. Shared by the trip's route and the one for people with no trip.
 */
export function placeAbout(placeId: string): Promise<{ about: PlaceAbout | null }> {
  return cached<{ about: PlaceAbout | null }>(`places:about:v2:${placeId}`, AI_TEXT_TTL_MS, async () => {
    const place = (await new GooglePlacesProvider().details(placeId)) as GooglePlaceDetails | null;
    if (!place?.displayName?.text) return { about: null };
    const snippets = await webSnippets(placeId, place.displayName.text, cityFrom(place.formattedAddress));
    return { about: await writePlaceAbout({ place, snippets }) };
  });
}
