import type { Place } from "@/packages/contracts/place";
import { haversineKm } from "@/lib/application/geo";
import { rankPlaces, type RankContext, type RankedPlace } from "@/lib/application/rank-places";
import type { Lane } from "./vibes";

/** One lane's raw provider results, before dedupe / filter / rank. */
export type LaneInput<E extends { url: string }> = { lane: Lane; places: Place[]; events: E[] };
/** Shaped lane — places carry the `why` line from `rankPlaces` for the UI. */
export type LaneOutput<E extends { url: string }> = { lane: Lane; places: RankedPlace[]; events: E[] };

export type ShapeContext = {
  /** Places already shown (the anchor + rejected shortlist) — never surfaced. Mutated as lanes fill. */
  seenPlaceIds: Set<string>;
  /** Events already shown (the anchor, for an event page). Mutated as lanes fill. */
  seenEventUrls: Set<string>;
  anchorPoint: { latitude: number; longitude: number } | null;
  /** interests / likes / dislikes / savedIds — the traveller-fit signals for `rankPlaces`. */
  rankCtx: Omit<RankContext, "anchor">;
  /** Cosine scores by providerId for a `semantic` lane's candidates. Omit to skip the re-rank. */
  score?: (lane: Lane, candidates: Place[]) => Promise<Record<string, number>>;
};

/** How much a unit of cosine similarity is worth against `rankPlaces`'s own score. */
const SEMANTIC_WEIGHT = 2;

/** Not a display limit — a real provider response never gets close to this. Only stops a
 *  malformed/abusive one from rendering thousands of DOM nodes. */
const SAFETY_CAP = 50;

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const normalizeChainName = (name: string) => name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Turn each lane's raw results into what the UI renders: drop the anchor and anything a
 * higher lane already claimed (first lane wins), radius-filter the lanes that ask for it,
 * rank by traveller fit + proximity, and — for a "more like this" lane — blend in the
 * embedding-similarity score. Pure apart from the injected `score` callback.
 */
export async function shapeLanes<E extends { url: string }>(
  inputs: Array<LaneInput<E>>,
  ctx: ShapeContext,
): Promise<Array<LaneOutput<E>>> {
  const out: Array<LaneOutput<E>> = [];
  // Normalise the fit signals so a caller passing a stray non-array can't crash rankPlaces.
  const rankCtx = {
    ...ctx.rankCtx,
    interests: arr(ctx.rankCtx.interests),
    likes: arr(ctx.rankCtx.likes),
    dislikes: arr(ctx.rankCtx.dislikes),
  };

  for (const { lane, places, events } of inputs) {
    // Drop the anchor / already-shown places AND collapse a provider that returned the
    // same place twice in one response (broadened queries can re-surface a hit).
    const localSeen = new Set<string>();
    let candidates = places.filter((p) => {
      if (ctx.seenPlaceIds.has(p.providerId) || localSeen.has(p.providerId)) return false;
      localSeen.add(p.providerId);
      return true;
    });
    if (lane.radiusKm && ctx.anchorPoint) {
      candidates = candidates.filter(
        (p) =>
          Number.isFinite(p.latitude) &&
          Number.isFinite(p.longitude) &&
          haversineKm(ctx.anchorPoint!, p) <= lane.radiusKm!,
      );
    }

    let ranked = rankPlaces(candidates, { ...rankCtx, anchor: ctx.anchorPoint });
    if (lane.semantic && ctx.score && ranked.length > 1) {
      const raw = await ctx.score(lane, ranked.map((r) => r.place)).catch(() => null);
      const scores = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, number>) : {};
      ranked = ranked
        .map((r) => {
          const s = scores[r.place.providerId];
          return { ...r, score: r.score + SEMANTIC_WEIGHT * (typeof s === "number" && Number.isFinite(s) ? s : 0) };
        })
        .sort((a, b) => b.score - a.score);
    }

    // A chain (Food Bazaar, Starbucks, ...) often has several branches nearby, each a distinct
    // place with its own id — without this a lane can fill entirely with one brand's locations.
    // `ranked` is best-first, so this keeps each chain's best branch and drops the rest.
    const seenChain = new Set<string>();
    ranked = ranked.filter((r) => {
      const key = normalizeChainName(r.place.name);
      if (seenChain.has(key)) return false;
      seenChain.add(key);
      return true;
    });

    // No curatorial cap — a lane shows everything it finds. This ceiling exists only to
    // survive a pathological provider response (thousands of results), not to limit a normal one.
    const finalPlaces = ranked.slice(0, SAFETY_CAP);
    finalPlaces.forEach((r) => ctx.seenPlaceIds.add(r.place.providerId));

    const localEventSeen = new Set<string>();
    const finalEvents = events
      .filter((e) => {
        if (ctx.seenEventUrls.has(e.url) || localEventSeen.has(e.url)) return false;
        localEventSeen.add(e.url);
        return true;
      })
      .slice(0, SAFETY_CAP);
    finalEvents.forEach((e) => ctx.seenEventUrls.add(e.url));

    out.push({ lane, places: finalPlaces, events: finalEvents });
  }

  return out.filter((r) => r.places.length > 0 || r.events.length > 0);
}
