import type { GooglePlaceDetails } from "@/lib/places-ui";

export type PlaceDetailsBody = { place?: GooglePlaceDetails | null; freshness?: { retrievedAt?: string } };

const inFlight = new Map<string, Promise<PlaceDetailsBody | null>>();

/**
 * One place's Google details, fetched once per session: the answer is kept in sessionStorage and a request already on its way is
 * shared by every caller. Several cards in a long chat (compare blocks, the map panel, the place page) ask for the same ids at the
 * same moment; before this each asked separately.
 */
export function fetchPlaceDetails(tripId: string, placeId: string): Promise<PlaceDetailsBody | null> {
  const key = `place-details:${tripId}:${placeId}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const body = JSON.parse(cached) as PlaceDetailsBody;
      if (body?.place) return Promise.resolve(body);
    }
  } catch { /* storage unavailable or malformed */ }
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = fetch(`/api/trips/${tripId}/places/google?placeId=${encodeURIComponent(placeId)}`)
    .then((r) => (r.ok ? (r.json() as Promise<PlaceDetailsBody>) : null))
    .then((body) => {
      if (body?.place) { try { sessionStorage.setItem(key, JSON.stringify(body)); } catch { /* full or unavailable */ } }
      return body;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** What a card already knows about a place, kept for the instant its details page opens: the page paints the name and photo at once instead of a grey skeleton. */
export type PlaceSeed = { title: string; subtitle?: string | null; photo?: string | null; rating?: number | null };
const seeds = new Map<string, PlaceSeed>();
const seedKey = (tripId: string, placeId: string) => `place-seed:${tripId}:${placeId}`;

export function readPlaceSeed(tripId: string, placeId: string): PlaceSeed | null {
  const hit = seeds.get(seedKey(tripId, placeId));
  if (hit) return hit;
  try {
    const raw = sessionStorage.getItem(seedKey(tripId, placeId));
    return raw ? (JSON.parse(raw) as PlaceSeed) : null;
  } catch {
    return null;
  }
}

/**
 * Called the moment a place card is touched (before the tap even finishes): starts the details request and keeps what the card showed,
 * so by the time the page has slid in there is a title and a photograph on it and the details are already on their way.
 */
export function warmPlace(tripId: string, placeId: string, seed: PlaceSeed): void {
  const key = seedKey(tripId, placeId);
  seeds.set(key, seed);
  try { sessionStorage.setItem(key, JSON.stringify(seed)); } catch { /* full or blocked */ }
  void fetchPlaceDetails(tripId, placeId);
}
