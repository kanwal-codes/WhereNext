import greatCircle from "@turf/great-circle";

type Point = { latitude: number; longitude: number };

/** "550 m" under 1 km, else "1.8 km" — the display form for a straight-line or route distance
 *  shown on a card, used everywhere one is (previously duplicated ad hoc at each call site). */
export function formatDistanceKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/**
 * Straight-line cutoff for surfacing "near your stay" as a browsing nudge on a place a
 * traveller is passively looking at (Discover, "Around here") — not the same thing as the
 * unconditional "X from <anchor>" line on a card that's the direct, explicit answer to a
 * question they asked (chat search results always show that regardless of distance, since a
 * far answer is still the answer to "where's the nearest place that serves X"). 2 km is
 * conservative for a straight-line proxy with no real routing behind it (a river, a highway, a
 * one-way system can all turn 2 km as the crow flies into a much longer real trip) — comfortably
 * under an hour's walk, closer to 15-25 minutes on foot or a short ride, and short enough that a
 * false positive here is rare even without live travel-time data.
 */
export const NEARBY_STAY_KM = 2;

/** Straight-line distance in km. A rough proxy for "how close" — not travel time. */
export function haversineKm(a: Point, b: Point): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Elasticsearch-style gauss decay: 1.0 within `offset` km, falling off smoothly past it —
 * `decay` (0.5 by default) is the score at exactly `scale` km beyond the offset, approaching 0
 * well beyond that. Not a hard cutoff (per docs/overhaul/recommendation-system/ranking-signals.md
 * — "a relevant result further away can outrank a closer, less relevant one").
 */
export function distanceDecay(km: number, { offset, scale, decay = 0.5 }: { offset: number; scale: number; decay?: number }): number {
  const d = Math.max(0, km - offset);
  if (d === 0) return 1;
  const sigma = scale / Math.sqrt(-2 * Math.log(decay));
  return Math.exp(-(d ** 2) / (2 * sigma ** 2));
}

/** A curved great-circle path between two [lng, lat] points, for drawing flight/long-haul legs
 * on the map instead of a straight line. Falls back to a straight 2-point line for the (rare)
 * antimeridian-crossing case, where turf's great-circle returns a MultiLineString. */
export function greatCircleArc(from: [number, number], to: [number, number], npoints = 100): Array<[number, number]> {
  const arc = greatCircle(from, to, { npoints });
  return arc.geometry.type === "LineString" ? (arc.geometry.coordinates as Array<[number, number]>) : [from, to];
}

/** Nearest of `targets` to `from`, with its straight-line distance, or null if none have coordinates. */
export function nearest<T extends Point & { title: string }>(from: Point, targets: T[]): { target: T; km: number } | null {
  let best: { target: T; km: number } | null = null;
  for (const target of targets) {
    if (!Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) continue;
    const km = haversineKm(from, target);
    if (!best || km < best.km) best = { target, km };
  }
  return best;
}
