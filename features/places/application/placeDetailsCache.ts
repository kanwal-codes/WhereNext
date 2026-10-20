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
