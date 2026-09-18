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

/** Google returns at most 20 places per page and 60 across all pages of one Text Search. */
const GOOGLE_PAGE_SIZE = 20;
const GOOGLE_MAX_RESULTS = 60;

/** A soft nudge toward a point, not a hard restriction — Google can still return a better-matching
 *  result further out (per Google's own local-ranking guidance, see
 *  docs/overhaul/recommendation-system/ranking-signals.md), it just stops treating every city on
 *  earth as equally plausible for a generic query. 20km comfortably covers "this city". */
export type LocationBias = { lat: number; lng: number; radiusMeters?: number };
const DEFAULT_BIAS_RADIUS_METERS = 20_000;

export class GooglePlacesProvider {
  private key() { const key = process.env.GOOGLE_MAPS_API_KEY; if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured"); return key; }
  /**
   * `maxResults` beyond one page (20) follows `nextPageToken` to fill out the browse view; callers
   * that only need the top hit should leave it at the default so they don't pay for pages they'll
   * discard.
   *
   * `locationBias` — live-testing regression (2026-09-16): Google's Text Search was never given
   * any structured location, only whatever city name happened to be embedded in the free-text
   * query — so a generic, low-specificity query ("well-reviewed restaurants and cafes in
   * Montreal") could come back dominated by a completely different city (confirmed live:
   * Toronto/Ontario results for a Montreal-anchored query), with nothing in the request telling
   * Google where "around here" actually is. Optional and additive — every existing caller that
   * doesn't have a coordinate handy keeps working exactly as before.
   */
  async search(query: string, signal?: AbortSignal, maxResults = GOOGLE_PAGE_SIZE, locationBias?: LocationBias): Promise<Place[]> {
    if (process.env.NODE_ENV === "test") return this.searchUncached(query, signal, maxResults, locationBias);
    // Bias rounded to ~1km so nearby anchors on the same page share a cache entry instead of
    // fragmenting it per exact coordinate.
    const biasKey = locationBias ? `:${locationBias.lat.toFixed(2)},${locationBias.lng.toFixed(2)}` : "";
    const cacheKey = `google-places:${query.trim().toLowerCase()}:${maxResults}${biasKey}`;
    return cached(cacheKey, 60_000, () => this.searchUncached(query, signal, maxResults, locationBias));
  }
  private async searchUncached(query: string, signal?: AbortSignal, maxResults = GOOGLE_PAGE_SIZE, locationBias?: LocationBias): Promise<Place[]> {
    const cap = Math.min(maxResults, GOOGLE_MAX_RESULTS);
    const places: SearchPlace[] = [];
    let pageToken: string | undefined;
    const bias = locationBias
      ? { circle: { center: { latitude: locationBias.lat, longitude: locationBias.lng }, radius: locationBias.radiusMeters ?? DEFAULT_BIAS_RADIUS_METERS } }
      : undefined;
    do {
      // Pagination requires resending the original query verbatim alongside pageToken, or Google 400s.
      const response = await guardedFetch("google-places", "https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": this.key(), "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.googleMapsUri,places.rating,places.userRatingCount,places.photos.name,nextPageToken" }, body: JSON.stringify({ textQuery: broadenQuery(query), pageSize: GOOGLE_PAGE_SIZE, ...(bias ? { locationBias: bias } : {}), ...(pageToken ? { pageToken } : {}) }), signal: withProviderTimeout(signal) });
      if (!response.ok) {
        // Google's own error body (e.g. "API_KEY_HTTP_REFERRER_BLOCKED", "RESOURCE_EXHAUSTED")
        // is the one thing that actually distinguishes a key/IP restriction from a quota hit
        // from a malformed request — a bare status code alone left every one of those looking
        // identical to whatever caught this ("google-places unavailable"), with no way to tell
        // them apart short of reproducing the exact call outside the app.
        const detail = await response.text().catch(() => "");
        throw new Error(`Google Places search failed: ${response.status} ${detail.slice(0, 500)}`);
      }
      const body = await response.json() as { places?: SearchPlace[]; nextPageToken?: string };
      places.push(...(body.places ?? []));
      pageToken = body.nextPageToken;
    } while (pageToken && places.length < cap);
    return places.slice(0, cap).flatMap((place) => place.location ? [{ provider: "google-places", providerId: place.id, name: place.displayName?.text ?? "Unnamed place", category: place.primaryType ?? null, latitude: place.location.latitude, longitude: place.location.longitude, address: place.formattedAddress ?? null, rating: place.rating, userRatingCount: place.userRatingCount, sourceUrl: place.googleMapsUri ?? null, photoNames: place.photos?.map((photo) => photo.name) ?? [] }] : []);
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

  /** City/region typeahead for a destination field — restricted to locality-level results so
   *  "Paris" surfaces the city, not a bakery chain, the way a general text search would. */
  async autocompleteRegions(input: string, signal?: AbortSignal): Promise<Array<{ placeId: string; text: string; secondaryText: string | null }>> {
    const response = await guardedFetch("google-places", "https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.key() },
      body: JSON.stringify({ input, includedPrimaryTypes: ["locality", "administrative_area_level_1", "administrative_area_level_2", "country"] }),
      signal: withProviderTimeout(signal),
    });
    if (!response.ok) throw new Error(`Google Places autocomplete failed: ${response.status}`);
    const body = await response.json() as {
      suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }>;
    };
    return (body.suggestions ?? []).flatMap((s) => {
      const p = s.placePrediction;
      const text = p?.structuredFormat?.mainText?.text ?? p?.text?.text;
      if (!p?.placeId || !text) return [];
      return [{ placeId: p.placeId, text, secondaryText: p.structuredFormat?.secondaryText?.text ?? null }];
    });
  }

  /** Same place's details are asked for repeatedly within seconds — a card shown, then reopened,
   *  then a chat tool call about it — so this is cached exactly like `.search()` above. Not tied
   *  to any one caller's `signal`: the cached load is shared, so one caller's abort must not cancel
   *  it out from under a concurrent caller who's still waiting on it.
   *
   *  `fields`: "full" (default) is the on-demand Details view a user opens for one selected
   *  place — it additionally includes `reviews`/`photos`. "light" drops those two fields for a
   *  caller (RETRIEVE's background per-search-result enrichment, up to 6 places per search) that
   *  never reads them, saving on response size/parsing for results that mostly get discarded by
   *  ranking anyway. It does NOT reach a cheaper Places SKU tier, despite the name: both masks
   *  request `accessibilityOptions` and `editorialSummary`, and those two fields alone already
   *  put the call in Google's priciest "Enterprise + Atmosphere" tier — the same tier
   *  `reviews`/`photos` are in. This is a deliberate, accepted tradeoff, not a bug: accessibility
   *  info is load-bearing for a real hard-constraint safety feature (never recommend a place
   *  known to fail a stated accessibility need — see `filterAndRank` in `lib/application/retrieve.ts`),
   *  and the editorial summary feeds place descriptions. Dropping either to chase the cheap tier
   *  would be a user-harming regression, not a cleanup. See
   *  docs/overhaul/chatbot-overhaul/data-providers.md and
   *  docs/overhaul/roadmap/overhaul-roadmap.md ("Google Places field-mask 'billing bug'"). */
  async details(placeId: string, signal?: AbortSignal, fields: "full" | "light" = "full") {
    if (process.env.NODE_ENV === "test") return this.detailsUncached(placeId, signal, fields);
    return cached(`google-place-details:${fields}:${placeId}`, 60_000, () => this.detailsUncached(placeId, undefined, fields));
  }
  private async detailsUncached(placeId: string, signal?: AbortSignal, fields: "full" | "light" = "full") {
    // The amenity booleans below (outdoorSeating..allowsDogs) are already in the same
    // "Enterprise + Atmosphere" SKU tier as accessibilityOptions/editorialSummary above (see the
    // billing note on this function) — adding them to the "full" mask costs nothing extra, and
    // they're what actually make the detail page's About section say something specific instead
    // of just repeating the rating.
    const fieldMask = fields === "light"
      ? "id,displayName,formattedAddress,location,primaryType,googleMapsUri,websiteUri,nationalPhoneNumber,businessStatus,priceLevel,rating,userRatingCount,editorialSummary,regularOpeningHours,accessibilityOptions"
      : "id,displayName,formattedAddress,location,primaryType,types,googleMapsUri,websiteUri,nationalPhoneNumber,businessStatus,priceLevel,rating,userRatingCount,editorialSummary,regularOpeningHours,accessibilityOptions,reviews,photos,outdoorSeating,liveMusic,servesCocktails,goodForGroups,goodForChildren,dineIn,takeout,delivery,reservable,allowsDogs";
    const response = await guardedFetch("google-places", `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "x-goog-api-key": this.key(), "x-goog-fieldmask": fieldMask }, signal: withProviderTimeout(signal) });
    if (!response.ok) throw new Error(`Google Place details failed: ${response.status}`);
    return response.json();
  }
  photoUrl(photoName: string) { return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${encodeURIComponent(this.key())}`; }
}
