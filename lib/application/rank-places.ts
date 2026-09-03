import { haversineKm } from "./geo";
import type { Place } from "@/packages/contracts/place";

/**
 * Pure Discover ranker. No provider or DB imports, so feature UI modules can
 * call it directly. Orders places by a weighted blend of quality, fit to the
 * traveller's interests, proximity to where they're based, and novelty, and
 * drops anything matching a stated dislike.
 */

export type RankAnchor = { latitude: number; longitude: number };

export type RankContext = {
  interests?: string[];
  likes?: string[];
  dislikes?: string[];
  savedIds?: Iterable<string>;
  rejectedIds?: Iterable<string>;
  /** Where the traveller is based this trip — a locked stay, else the itinerary centroid. */
  anchor?: RankAnchor | null;
};

export type RankedPlace = { place: Place; score: number; why: string | null };

// ponytail: one-line stemmer, duplicated from retrieve.ts rather than a shared lib/text-match module — two callers, two lines.
const stem = (word: string) => word.replace(/(ies|es|s)$/, (m) => (m === "ies" ? "y" : ""));
const wordSet = (text: string): Set<string> =>
  new Set(text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).map(stem));

export function rankPlaces(places: Place[], ctx: RankContext = {}): RankedPlace[] {
  const wanted = wordSet([...(ctx.interests ?? []), ...(ctx.likes ?? [])].join(" "));
  const dislikeStems = (ctx.dislikes ?? []).flatMap((d) => [...wordSet(d)]);
  const seen = new Set<string>([...(ctx.savedIds ?? []), ...(ctx.rejectedIds ?? [])]);

  const scored: RankedPlace[] = [];
  for (const place of places) {
    const haystack = wordSet(`${place.name} ${place.category ?? ""}`);
    if (dislikeStems.some((term) => haystack.has(term))) continue; // stated dislike → drop

    const rating = typeof place.rating === "number" ? place.rating : 3.8;
    const count = typeof place.userRatingCount === "number" ? place.userRatingCount : 0;
    const quality = (rating / 5) * Math.log10(count + 10); // ~0..4

    const overlap = [...wanted].filter((w) => haystack.has(w)).length;
    const fit = 2 * overlap; // a personalised feed: an interest match outweighs a rating-count gap

    let proximity = 0;
    if (ctx.anchor && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
      proximity = 2 / (1 + haversineKm(ctx.anchor, place));
    }

    const novelty = seen.has(place.providerId) ? -1 : 0;
    const score = quality + fit + proximity + novelty;

    let why: string | null = null;
    if (proximity >= 1) why = "Near where you're staying";
    else if (overlap > 0) why = `Matches ${[...wanted].filter((w) => haystack.has(w)).slice(0, 2).join(", ")}`;
    else if (quality >= 3) why = "Top-rated";

    scored.push({ place, score, why });
  }
  return scored.sort((a, b) => b.score - a.score);
}
