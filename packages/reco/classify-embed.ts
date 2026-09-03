import { cosine, embed } from "@/packages/ai/embed";
import type { Vibe } from "./vibes";

/**
 * Embedding classifier — the tail fallback for `classifyPlaceVibe`, used only when the
 * Google type map and the keyword scan both came up "default" (a shrine tagged
 * `tourist_attraction`, a venue tagged `point_of_interest`, …). Compares the anchor's
 * text to a fixed set of one-line vibe prototypes. Server-only: needs an embeddings key.
 */

const PROTOTYPES: Array<[Vibe, string]> = [
  ["green_space", "a botanical garden, public park, arboretum or nature reserve — greenery, walking paths, open air"],
  ["live_music", "a live music concert, gig, music festival or arena show"],
  ["nightlife", "a nightclub, cocktail bar, lounge or late-night party venue"],
  ["sacred", "a temple, church, mosque, gurdwara, shrine or pilgrimage site for worship and quiet reflection"],
  ["expo", "a trade show, tech expo, convention, conference or exhibition hall"],
  ["performing_arts", "a theatre, comedy club, opera house, ballet or live stage performance"],
  ["museum_culture", "a museum, art gallery, historic landmark or cultural heritage site"],
  ["beach_water", "a beach, seafront promenade, pier, boardwalk or waterfront"],
  ["sports", "a stadium, sports arena, live match, golf course or sports complex"],
  ["food_scene", "a food market, food hall, night market or notable restaurant district"],
];

let cache: { vibes: Vibe[]; vectors: number[][] } | null = null;

async function prototypes(signal?: AbortSignal) {
  if (!cache) {
    const vectors = await embed(PROTOTYPES.map(([, text]) => text), signal);
    cache = { vibes: PROTOTYPES.map(([vibe]) => vibe), vectors };
  }
  return cache;
}

// Thresholds tuned on text-embedding-3-small: its cosine range is compressed, so a bare
// absolute floor barely rejects anything. Measured on real venues vs. junk inputs
// (parking garage, distribution warehouse, water treatment plant):
//   real match  → top score ≥ 0.34, margin over 2nd ≥ 0.09
//   junk        → top score ≤ 0.30, margin ≤ 0.05
// Accept when the top score clears MIN_CONFIDENT *or* it stands clear of the pack by
// MIN_MARGIN — the OR keeps a genuine dual-vibe place (high score, low margin) in.
const MIN_FLOOR = 0.22;      // absolute safety net
const MIN_CONFIDENT = 0.32;  // a clear single-vibe hit
const MIN_MARGIN = 0.07;     // top must beat the runner-up by this to pass on margin alone
const SECONDARY_GAP = 0.05;  // runner-up within this of the top → surface it as a facet

/** Best vibe for `text`, or null when embeddings are unavailable or nothing resembles a
 *  known vibe. A close runner-up (within `SECONDARY_GAP` cosine) comes back as `secondary`. */
export async function classifyByEmbedding(
  text: string,
  signal?: AbortSignal,
): Promise<{ vibe: Vibe; secondary?: Vibe } | null> {
  try {
    const [{ vibes, vectors }, [query]] = await Promise.all([prototypes(signal), embed([text], signal)]);
    if (!Array.isArray(query) || query.length === 0) return null;
    const scored = vectors
      .map((vector, i) => ({ vibe: vibes[i], score: cosine(query, vector) }))
      .sort((a, b) => b.score - a.score);
    if (!scored.length || !Number.isFinite(scored[0].score)) return null;
    const margin = scored[0].score - (scored[1]?.score ?? 0);
    if (scored[0].score < MIN_FLOOR) return null;
    if (scored[0].score < MIN_CONFIDENT && margin < MIN_MARGIN) return null;
    const secondary = scored[1] && scored[1].score >= scored[0].score - SECONDARY_GAP ? scored[1].vibe : undefined;
    return { vibe: scored[0].vibe, secondary };
  } catch {
    return null;
  }
}
