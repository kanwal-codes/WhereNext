import type { Place } from "@/packages/contracts/place";

/** One-line suffix stemmer ("places" -> "place", "activities" -> "activity") — good enough for
 *  matching a dislike/interest word against a place's name/category, not real stemming. Shared
 *  with `rank-places.ts`, the other place-word-matching caller. */
export const stem = (word: string) => word.replace(/(ies|es|s)$/, (match) => (match === "ies" ? "y" : ""));

/**
 * Drops places that match a user's stated dislikes (stemmed keyword match against name/
 * category) and hard-filters out anywhere KNOWN to fail a stated accessibility need. Extracted
 * (Phase 1.1, docs/overhaul/roadmap/phase-1-structural-refactor.md) from retrieveEvidence's
 * inline `filterAndRank` closure so the recommendation system can call the identical logic
 * instead of never filtering on preferences at all — see
 * docs/overhaul/recommendation-system/shared-preference-filtering-gap.md.
 *
 * A stated accessibility need is a hard requirement, not a rankable preference: a place we KNOW
 * is not wheelchair-accessible (enrichment actually checked and got `false`) must never be
 * recommended. Unknown status (no enrichment ran, or the provider simply hasn't recorded it) is
 * left in rather than dropped — "we don't know" is not the same claim as "not accessible", and
 * over-filtering to only the handful of enriched, confirmed-accessible results would make most
 * searches come back nearly empty. Callers are responsible for telling the user plainly when a
 * shown place's accessibility is unconfirmed.
 */
export function filterByPreferences(places: Place[], preferences: { dislikes?: string[]; accessibilityNeeds?: string[] }): Place[] {
  const dislikeStems = (preferences.dislikes ?? [])
    .flatMap((phrase) => phrase.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 2))
    .map(stem);
  const liked = dislikeStems.length
    ? places.filter((place) => {
        const words = new Set(`${place.name} ${place.category ?? ""}`.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem));
        return !dislikeStems.some((term) => words.has(term));
      })
    : places;
  const needsAccessible = (preferences.accessibilityNeeds ?? []).length > 0;
  return needsAccessible ? liked.filter((place) => place.wheelchairAccessible !== false) : liked;
}
