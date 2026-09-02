import type { SupabaseClient } from "@supabase/supabase-js";
import type { Place } from "@/packages/contracts/place";

type SavedPlaceRow = { places: unknown };
type DatabasePlace = { name: string; provider: string; provider_id: string; category: string | null; address: string | null; metadata?: Record<string, unknown> };

export function createPlaceRepository(supabase: SupabaseClient, catalog = supabase) {
  return {
    async saved(tripId: string) {
      const result = await supabase.from("trip_places").select("status, places(id,name,provider,provider_id,category,address,location,metadata)").eq("trip_id", tripId).eq("status", "saved");
      if (result.error) throw result.error;
      return (result.data as SavedPlaceRow[] | null ?? []).flatMap((row) => {
        const raw = Array.isArray(row.places) ? row.places[0] : row.places;
        const place = raw as DatabasePlace | null;
        if (!place) return [];
        const metadata = place.metadata ?? {};
        return [{ provider: place.provider, providerId: place.provider_id, name: place.name, category: place.category, address: place.address, latitude: typeof metadata.latitude === "number" ? metadata.latitude : 0, longitude: typeof metadata.longitude === "number" ? metadata.longitude : 0, rating: typeof metadata.rating === "number" ? metadata.rating : undefined, userRatingCount: typeof metadata.userRatingCount === "number" ? metadata.userRatingCount : undefined, sourceUrl: typeof metadata.sourceUrl === "string" ? metadata.sourceUrl : null, photoNames: Array.isArray(metadata.photoNames) ? metadata.photoNames.filter((value): value is string => typeof value === "string") : [] } satisfies Place];
      });
    },
    async save(tripId: string, place: Place) {
      const saved = await catalog.from("places").upsert({ provider: place.provider, provider_id: place.providerId, name: place.name, category: place.category, address: place.address, location: `SRID=4326;POINT(${place.longitude} ${place.latitude})`, metadata: { sourceUrl: place.sourceUrl, rating: place.rating, userRatingCount: place.userRatingCount, latitude: place.latitude, longitude: place.longitude, photoNames: place.photoNames ?? [] } }, { onConflict: "provider,provider_id" }).select("id").single();
      if (saved.error) throw saved.error;
      const link = await supabase.from("trip_places").upsert({ trip_id: tripId, place_id: saved.data.id, status: "saved" });
      if (link.error) throw link.error;
      if (place.sourceUrl) {
        const source = await supabase.from("sources").upsert({ trip_id: tripId, entity_type: "place", entity_id: place.providerId, provider: place.provider, url: place.sourceUrl, retrieved_at: new Date().toISOString(), metadata: { rating: place.rating, userRatingCount: place.userRatingCount } }, { onConflict: "trip_id,entity_type,entity_id,provider" });
        if (source.error) throw source.error;
      }
      return place;
    },
  };
}
