import { formatDistanceKm, haversineKm, NEARBY_STAY_KM } from "./geo";
import { stem } from "./preference-filter";
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
  /** Where the traveller is based this trip — a locked stay, else the itinerary centroid.
   *  Drives the proximity SCORE only. See `stayAnchor` for the "why" label — a centroid
   *  averaged from several unrelated itinerary stops has nothing real to name, so labelling
   *  proximity to it as "near your stay" would just be wrong. */
  anchor?: RankAnchor | null;
  /** The locked stay's own coordinates specifically, distinct from `anchor` above. Only ever
   *  set when a stay is genuinely locked in, so a "why" built from it can honestly say "from
   *  your stay" and mean it — unlike `anchor`, which may be a same-ish fallback guess. */
  stayAnchor?: RankAnchor | null;
  /** Show distances in miles. */
  miles?: boolean;
};

export type RankedPlace = { place: Place; score: number; why: string | null };

const wordSet = (text: string): Set<string> =>
  new Set(text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).map(stem));

/**
 * Phase 4.1 (docs/overhaul/roadmap/phase-4-recommendation-ranking.md) — prominence: rating and
 * review count combined, per docs/overhaul/recommendation-system/ranking-signals.md ("a place
 * with 4.8★ from 3 reviews should generally rank below 4.5★ from 400 reviews; review count is
 * itself a prominence signal, not just the average rating"). Missing rating/count default to a
 * modest, unrated-newcomer baseline rather than crashing or scoring as if untrustworthy (0).
 */
export function prominenceScore(rating: number | undefined, reviewCount: number | undefined): number {
  const r = typeof rating === "number" ? rating : 3.8;
  const count = typeof reviewCount === "number" ? reviewCount : 0;
  return (r / 5) * Math.log10(count + 10); // ~0..4
}

export function rankPlaces(places: Place[], ctx: RankContext = {}): RankedPlace[] {
  const wanted = wordSet([...(ctx.interests ?? []), ...(ctx.likes ?? [])].join(" "));
  const dislikeStems = (ctx.dislikes ?? []).flatMap((d) => [...wordSet(d)]);
  const saved = new Set<string>(ctx.savedIds ?? []);
  const rejected = new Set<string>(ctx.rejectedIds ?? []);

  const scored: RankedPlace[] = [];
  for (const place of places) {
    // A rejected place contradicts stated intent — drop it outright, not just deprioritise it.
    // An already-saved one still belongs in the feed (just lower down): the novelty penalty below.
    if (rejected.has(place.providerId)) continue;
    const haystack = wordSet(`${place.name} ${place.category ?? ""}`);
    if (dislikeStems.some((term) => haystack.has(term))) continue; // stated dislike → drop

    const quality = prominenceScore(place.rating, place.userRatingCount);

    const overlap = [...wanted].filter((w) => haystack.has(w)).length;
    const fit = 2 * overlap; // a personalised feed: an interest match outweighs a rating-count gap

    let proximity = 0;
    if (ctx.anchor && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
      proximity = 2 / (1 + haversineKm(ctx.anchor, place));
    }

    const novelty = saved.has(place.providerId) ? -1 : 0;
    const score = quality + fit + proximity + novelty;

    // A passively-browsed suggestion only earns a stay-proximity callout when it's genuinely
    // close enough to weigh into a decision (NEARBY_STAY_KM) — a hotel on the edge of town would
    // otherwise put a technically-true but useless "48 min from your stay" on every single card.
    let why: string | null = null;
    if (ctx.stayAnchor && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
      const stayKm = haversineKm(ctx.stayAnchor, place);
      if (stayKm <= NEARBY_STAY_KM) why = `${formatDistanceKm(stayKm, ctx.miles)} from your stay`;
    }
    if (!why && overlap > 0) {
      const matched = [...wanted].filter((w) => haystack.has(w)).slice(0, 2);
      why = matched.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(", ");
    }
    if (!why && quality >= 3) why = "Top-rated";

    scored.push({ place, score, why });
  }
  return scored.sort((a, b) => b.score - a.score);
}
