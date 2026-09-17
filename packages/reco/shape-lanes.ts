import type { Place } from "@/packages/contracts/place";
import { distanceDecay, haversineKm } from "@/lib/application/geo";
import { filterByPreferences } from "@/lib/application/preference-filter";
import { rankPlaces, type RankContext, type RankedPlace } from "@/lib/application/rank-places";
import { classifyPlaceVibe, type Lane } from "./vibes";

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
  /** Phase 4.4 — same hard requirement the chatbot's RETRIEVE stage enforces (preference-filter.ts):
   *  a place KNOWN to fail a stated accessibility need is dropped, not just deprioritised. */
  accessibilityNeeds?: string[];
  /** Cosine scores by providerId for a `semantic` lane's candidates. Omit to skip the re-rank. */
  score?: (lane: Lane, candidates: Place[]) => Promise<Record<string, number>>;
};

/** How much a unit of cosine similarity is worth against `rankPlaces`'s own score. */
const SEMANTIC_WEIGHT = 2;

/** How much a unit of distance-decay score (0..1) is worth against `rankPlaces`'s own score —
 *  same scale as SEMANTIC_WEIGHT, so a lane's old `radiusKm` still dominates ordering within
 *  it without acting as a hard cliff (Phase 4.2.2). */
const RADIUS_DECAY_WEIGHT = 2;

/** Not a display limit — a real provider response never gets close to this. Only stops a
 *  malformed/abusive one from rendering thousands of DOM nodes. */
const SAFETY_CAP = 50;

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const normalizeChainName = (name: string) => name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Turn each lane's raw results into what the UI renders: drop the anchor and anything a
 * higher lane already claimed (first lane wins), drop stated dislikes/accessibility misses,
 * rank by traveller fit + proximity + prominence, decay-weight a radius lane's distance (not a
 * hard cutoff), and — for a "more like this" lane — blend in the embedding-similarity score.
 * Pure apart from the injected `score` callback.
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
  const accessibilityNeeds = arr(ctx.accessibilityNeeds);

  // A semantic lane's re-score only re-weights ORDER within places that already survived
  // cross-lane dedup, chain dedup, and the safety cap below — it never changes WHICH places
  // those are. So it can't affect `ctx.seenPlaceIds`/`ctx.seenEventUrls` or any other lane's
  // candidate set, and every semantic lane's score call is independent of every other one
  // (same anchor, different candidates). Collected here and awaited together after the loop,
  // instead of one `await` per semantic lane inside it — on a page with two semantic lanes
  // (a vibe's own lane plus a secondary-vibe facet lane), that was a fully serialized second
  // network round trip for no reason.
  // ponytail: this does mean a semantic score can no longer flip which branch of a chain (e.g.
  // two branches of the same restaurant) survives chain-dedupe — dedupe now always keeps
  // whichever branch `rankPlaces` preferred before any semantic boost. Revisit if that specific
  // case ever turns out to matter; it's a narrower trade than serializing the network calls.
  const semanticWork: Array<{ lane: Lane; places: RankedPlace[]; apply: (scored: RankedPlace[]) => void }> = [];

  for (const { lane, places, events } of inputs) {
    // Drop the anchor / already-shown places AND collapse a provider that returned the
    // same place twice in one response (broadened queries can re-surface a hit).
    const localSeen = new Set<string>();
    let candidates = places.filter((p) => {
      if (ctx.seenPlaceIds.has(p.providerId) || localSeen.has(p.providerId)) return false;
      localSeen.add(p.providerId);
      return true;
    });
    // Phase 4.4 — same shared dislikes/accessibility filter the chatbot's RETRIEVE stage uses,
    // applied before ranking (previously the reco system never filtered on preferences at all).
    candidates = filterByPreferences(candidates, { dislikes: rankCtx.dislikes });
    candidates = filterByPreferences(candidates, { accessibilityNeeds });
    // Live-testing finding (2026-09-16): a text search for "nightclub"/"restaurant"/etc.
    // occasionally returns a short-term rental whose SEO-stuffed name matches the keyword (e.g.
    // "Montreal Nightlife with Sophistication Style - Newly Renovated Downtown Plateau", Google
    // category "lodging") — a listing, not a venue to go to. No lane in `LANES` (vibes.ts) ever
    // intends to surface lodging (even the `lodging` vibe's own lanes are food/coffee/things-to-do
    // NEAR a hotel, never "more hotels"), so this is always wrong, not vibe-dependent.
    candidates = candidates.filter((p) => classifyPlaceVibe({ primaryType: p.category, name: p.name }).vibe !== "lodging");

    let ranked = rankPlaces(candidates, { ...rankCtx, anchor: ctx.anchorPoint });

    // Phase 4.2.2 — a lane's `radiusKm` used to be a hard cutoff; now it's the decay function's
    // `offset`/`scale` (per docs/overhaul/recommendation-system/ranking-signals.md), so a place
    // just outside it can still appear, scored down rather than excluded outright. No coords →
    // no bonus (equivalent to "far"), not a crash or an exclusion.
    if (lane.radiusKm && ctx.anchorPoint) {
      const origin = ctx.anchorPoint;
      const radiusKm = lane.radiusKm;
      ranked = ranked
        .map((r) => {
          const hasCoords = Number.isFinite(r.place.latitude) && Number.isFinite(r.place.longitude);
          const weight = hasCoords ? distanceDecay(haversineKm(origin, r.place), { offset: radiusKm, scale: radiusKm }) : 0;
          return { ...r, score: r.score + RADIUS_DECAY_WEIGHT * weight };
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

    const output: LaneOutput<E> = { lane, places: finalPlaces, events: finalEvents };
    out.push(output);
    if (lane.semantic && ctx.score && finalPlaces.length > 1) {
      semanticWork.push({ lane, places: finalPlaces, apply: (scored) => { output.places = scored; } });
    }
  }

  if (semanticWork.length > 0) {
    await Promise.all(
      semanticWork.map(async ({ lane, places, apply }) => {
        const raw = await ctx.score!(lane, places.map((r) => r.place)).catch(() => null);
        const scores = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, number>) : {};
        apply(
          places
            .map((r) => {
              const s = scores[r.place.providerId];
              return { ...r, score: r.score + SEMANTIC_WEIGHT * (typeof s === "number" && Number.isFinite(s) ? s : 0) };
            })
            .sort((a, b) => b.score - a.score),
        );
      }),
    );
  }

  return out.filter((r) => r.places.length > 0 || r.events.length > 0);
}
