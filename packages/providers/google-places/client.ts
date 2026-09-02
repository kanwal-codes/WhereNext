import type { Place } from "@/packages/contracts/place";
import { withProviderTimeout } from "../request-signal";
import { cached } from "../../../lib/server/ttl-cache";

type SearchPlace = { id: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; primaryType?: string; googleMapsUri?: string; rating?: number; userRatingCount?: number; photos?: Array<{ name: string }> };

export class GooglePlacesProvider {
  private key() { const key = process.env.GOOGLE_MAPS_API_KEY; if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured"); return key; }
  async search(query: string, signal?: AbortSignal): Promise<Place[]> {
    if (process.env.NODE_ENV === "test") return this.searchUncached(query, signal);
    const cacheKey = `google-places:${query.trim().toLowerCase()}`;
    return cached(cacheKey, 60_000, () => this.searchUncached(query, signal));
  }
  private async searchUncached(query: string, signal?: AbortSignal): Promise<Place[]> {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": this.key(), "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.googleMapsUri,places.rating,places.userRatingCount,places.photos.name" }, body: JSON.stringify({ textQuery: query, pageSize: 10 }), signal: withProviderTimeout(signal) });
    if (!response.ok) throw new Error(`Google Places search failed: ${response.status}`);
    const body = await response.json() as { places?: SearchPlace[] };
    return (body.places ?? []).flatMap((place) => place.location ? [{ provider: "google-places", providerId: place.id, name: place.displayName?.text ?? "Unnamed place", category: place.primaryType ?? null, latitude: place.location.latitude, longitude: place.location.longitude, address: place.formattedAddress ?? null, rating: place.rating, userRatingCount: place.userRatingCount, sourceUrl: place.googleMapsUri ?? null, photoNames: place.photos?.map((photo) => photo.name) ?? [] }] : []);
  }
  async details(placeId: string, signal?: AbortSignal) { const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "x-goog-api-key": this.key(), "x-goog-fieldmask": "id,displayName,formattedAddress,location,primaryType,googleMapsUri,rating,userRatingCount,editorialSummary,regularOpeningHours,photos" }, signal: withProviderTimeout(signal) }); if (!response.ok) throw new Error(`Google Place details failed: ${response.status}`); return response.json(); }
  photoUrl(photoName: string) { return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${encodeURIComponent(this.key())}`; }
}
