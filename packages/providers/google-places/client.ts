import type { Place } from "@/packages/contracts/place";
import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";
import { cached } from "../../../lib/server/ttl-cache";

type SearchPlace = { id: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; primaryType?: string; googleMapsUri?: string; rating?: number; userRatingCount?: number; photos?: Array<{ name: string }> };
type NearbyPlace = SearchPlace & { nationalPhoneNumber?: string; websiteUri?: string };

export type NearbyBusiness = {
  providerId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  websiteUri: string | null;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri: string | null;
};

/**
 * Google's text search matches words fairly literally, so "temples" misses gurdwaras and churches.
 * When a query names a member of a known umbrella, add the sibling terms it isn't already asking for.
 */
const UMBRELLA: Array<[RegExp, string[]]> = [
  [/\b(temple|mandir|gurudwara|gurdwara|church|chapel|cathedral|mosque|masjid|synagogue|shrine|monastery|worship)s?\b/i,
    ["temple", "gurdwara", "church", "mosque", "synagogue", "shrine", "place of worship"]],
  [/\bmuseums?\b/i, ["museum", "gallery"]],
  [/\b(market|bazaar|souk)s?\b/i, ["market", "bazaar"]],
  [/\b(hike|hiking|trail)s?\b/i, ["hiking trail", "nature reserve", "viewpoint"]],
  [/\b(adventure|bungee|bungy|zipline|zip line|paraglid\w*|skydiv\w*|via ferrata)\b/i,
    ["bungee jumping", "zipline", "paragliding", "adventure park", "rock climbing"]],
  [/\b(water sports?|boating|kayak\w*|canoe\w*|paddleboard\w*|rafting|jet ski\w*|sailing)\b/i,
    ["boat tour", "kayak rental", "paddleboard", "sailing", "rafting"]],
];

export function broadenQuery(query: string): string {
  const lower = query.toLowerCase();
  for (const [re, terms] of UMBRELLA) {
    if (!re.test(lower)) continue;
    const missing = terms.filter((term) => !lower.includes(term));
    return missing.length ? `${query} ${missing.join(" ")}` : query;
  }
  return query;
}

export class GooglePlacesProvider {
  private key() { const key = process.env.GOOGLE_MAPS_API_KEY; if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured"); return key; }
  async search(query: string, signal?: AbortSignal): Promise<Place[]> {
    if (process.env.NODE_ENV === "test") return this.searchUncached(query, signal);
    const cacheKey = `google-places:${query.trim().toLowerCase()}`;
    return cached(cacheKey, 60_000, () => this.searchUncached(query, signal));
  }
  private async searchUncached(query: string, signal?: AbortSignal): Promise<Place[]> {
    const response = await guardedFetch("google-places", "https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": this.key(), "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.googleMapsUri,places.rating,places.userRatingCount,places.photos.name" }, body: JSON.stringify({ textQuery: broadenQuery(query), pageSize: 20 }), signal: withProviderTimeout(signal) });
    if (!response.ok) throw new Error(`Google Places search failed: ${response.status}`);
    const body = await response.json() as { places?: SearchPlace[] };
    return (body.places ?? []).flatMap((place) => place.location ? [{ provider: "google-places", providerId: place.id, name: place.displayName?.text ?? "Unnamed place", category: place.primaryType ?? null, latitude: place.location.latitude, longitude: place.location.longitude, address: place.formattedAddress ?? null, rating: place.rating, userRatingCount: place.userRatingCount, sourceUrl: place.googleMapsUri ?? null, photoNames: place.photos?.map((photo) => photo.name) ?? [] }] : []);
  }
  /** Businesses of a Google place type (e.g. "car_rental") near a point, nearest first. */
  async nearby(type: string, center: { lat: number; lng: number }, radiusMeters = 15_000, signal?: AbortSignal): Promise<NearbyBusiness[]> {
    const response = await guardedFetch("google-places", "https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.key(),
        "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri",
      },
      body: JSON.stringify({
        includedTypes: [type],
        maxResultCount: 20,
        rankPreference: "DISTANCE",
        locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusMeters } },
      }),
      signal: withProviderTimeout(signal),
    });
    if (!response.ok) throw new Error(`Google Places nearby search failed: ${response.status}`);
    const body = await response.json() as { places?: NearbyPlace[] };
    return (body.places ?? []).flatMap((place) => place.location ? [{
      providerId: place.id,
      name: place.displayName?.text ?? "Unnamed place",
      address: place.formattedAddress ?? null,
      latitude: place.location.latitude,
      longitude: place.location.longitude,
      phone: place.nationalPhoneNumber ?? null,
      websiteUri: place.websiteUri ?? null,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      googleMapsUri: place.googleMapsUri ?? null,
    }] : []);
  }

  async details(placeId: string, signal?: AbortSignal) { const response = await guardedFetch("google-places", `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "x-goog-api-key": this.key(), "x-goog-fieldmask": "id,displayName,formattedAddress,location,primaryType,types,googleMapsUri,websiteUri,nationalPhoneNumber,businessStatus,priceLevel,rating,userRatingCount,editorialSummary,regularOpeningHours,accessibilityOptions,reviews,photos" }, signal: withProviderTimeout(signal) }); if (!response.ok) throw new Error(`Google Place details failed: ${response.status}`); return response.json(); }
  photoUrl(photoName: string) { return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${encodeURIComponent(this.key())}`; }
}
