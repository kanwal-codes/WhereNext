import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { cached } from "@/lib/server/ttl-cache";
import { research } from "@/packages/providers/tavily/client";
import { cityFrom } from "@/lib/places-ui";

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Tavily's `content` is a raw scraped extract, not a single coherent blurb — the page it pulled
 *  from can splice together a clean description, a "[...]" truncation marker, and then a second
 *  reviewer's byline ("The Happy Traveler ·Jul 2026") and their own blurb, all as one string with
 *  no boundary of its own. Live-caught: a Montmorency Falls result showed exactly that — a
 *  legitimate paragraph followed by an orphaned byline and a typo'd second review — rendered
 *  verbatim as the page's "About" copy. Cut at the first such splice marker and end on a full
 *  sentence, so what's shown reads as one coherent excerpt instead of a raw scrape dump. */
function cleanExcerpt(content: string): string {
  const spliceMarkers = [
    /\[\s*\.\.\.\s*\]/, // an inline "[...]" truncation marker
    /[A-Z][\w' .-]{1,40}\s*[·•]\s*[A-Z][a-z]{2,8}\.?\s+\d{4}\b/, // an embedded "Name ·Mon YYYY" byline
  ];
  let cut = content;
  for (const marker of spliceMarkers) {
    const match = cut.match(marker);
    if (match?.index !== undefined) cut = cut.slice(0, match.index);
  }
  cut = cut.trim();
  const MAX_CHARS = 500;
  if (cut.length > MAX_CHARS) cut = cut.slice(0, MAX_CHARS);
  // A splice-marker cut (or the length cap above) can leave a dangling clause with no terminal
  // punctuation ("...2-3 hours. Visitors commend the") — trim back to the last full sentence,
  // but only when that keeps a meaningful chunk of the text, not for a short excerpt that simply
  // never had terminal punctuation to begin with.
  if (!/[.!?]$/.test(cut)) {
    const lastSentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    if (lastSentenceEnd > cut.length * 0.4) cut = cut.slice(0, lastSentenceEnd + 1);
  }
  return cut.trim();
}

/**
 * A short excerpt from the web, to supplement Google's own `editorialSummary` — which is often
 * one generic sentence ("Grand, swanky wood-clad venue...") or missing entirely, because Google
 * only writes those for a subset of well-known places. Cached a full day, far longer than the
 * details cache above: what a place is generally known for barely changes week to week, unlike
 * a price or an hour, so there's no reason to pay for a fresh search on every visit. Fails open
 * (null) on any Tavily error, missing key, or thin result — this is supplementary color the page
 * has always worked without, never something it depends on.
 *
 * Live-caught: an unquoted, generic-word-heavy name ("Crew Collective & Cafe") matched a search
 * result that was actually a video-game livestream transcript repeatedly saying "the crew" — a
 * length check alone doesn't catch a fluent, on-topic-sounding paragraph about something else
 * entirely, and presenting THAT as a description of the place is worse than showing nothing. The
 * place's own name (quoted in the query for a tighter match, and required to actually appear in
 * whatever comes back) is the one cheap, reliable relevance signal available without another
 * model call — a false negative here just means no summary shows, same as before this existed.
 */
async function fetchWebSummary(placeId: string, name: string, city: string, signal?: AbortSignal): Promise<{ content: string; source: { title: string; url: string } } | null> {
  try {
    const results = await cached(`places:web-summary:${placeId}`, 24 * 60 * 60_000, () => research(`"${name}"${city ? ` ${city}` : ""} review what it's like`, signal));
    const normalizedName = normalize(name);
    const hit = results.find((r) => r.content.length > 40 && normalize(`${r.title} ${r.content}`).includes(normalizedName));
    if (!hit) return null;
    const cleaned = cleanExcerpt(hit.content);
    return cleaned.length > 40 ? { content: cleaned, source: { title: hit.title, url: hit.url } } : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId);
    const placeId = new URL(request.url).searchParams.get("placeId");
    if (!placeId) return NextResponse.json({ error: "Place ID required" }, { status: 400 });
    const result = await cached(`places:details:${placeId}`, 900_000, async () => ({ place: await new GooglePlacesProvider().details(placeId, request.signal), retrievedAt: new Date().toISOString() }));
    const place = result.place;
    const webSummary = place?.displayName?.text
      ? await fetchWebSummary(placeId, place.displayName.text, cityFrom(place.formattedAddress), request.signal)
      : null;
    return NextResponse.json({ place, webSummary, freshness: { provider: "google-places", retrievedAt: result.retrievedAt, cacheTtlSeconds: 900 } });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place details unavailable");
  }
}
