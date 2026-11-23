import type { SupabaseClient } from "@supabase/supabase-js";
import type { Place } from "@/packages/contracts/place";

type SavedPlaceRow = { places: unknown };
type DatabasePlace = { name: string; provider: string; provider_id: string; category: string | null; address: string | null; metadata?: Record<string, unknown> };

/** Turns a client-sent place into the catalog's version of it (from the provider), or null when the provider does not know it. */
export type CatalogVerifier = (place: Place) => Promise<Place | null>;

export class UnverifiedPlaceError extends Error {
  constructor() { super("Place could not be found with its provider"); this.name = "UnverifiedPlaceError"; }
}

export function createPlaceRepository(supabase: SupabaseClient, catalog = supabase, verify?: CatalogVerifier) {
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
    async save(tripId: string, input: Place) {
      // `places` is a shared catalog keyed by (provider, provider_id) and read by EVERY trip that links the row (workspace,
      // assistant context, public share page). An existing row is only ever linked, never rewritten. A new row is written
      // from the provider's own data (`verify`), never from the request body: otherwise the first person to save a public
      // Google place id decided what every later trip saw for it.
      const existing = await catalog.from("places").select("id").eq("provider", input.provider).eq("provider_id", input.providerId).maybeSingle();
      if (existing.error) throw existing.error;
      let place = input;
      let saved: { data: { id: string } };
      if (existing.data) {
        saved = { data: existing.data as { id: string } };
      } else {
        if (verify) {
          const verified = await verify(input);
          if (!verified) throw new UnverifiedPlaceError();
          place = verified;
        }
        const row = { provider: place.provider, provider_id: place.providerId, name: place.name, category: place.category, address: place.address, location: `SRID=4326;POINT(${place.longitude} ${place.latitude})`, metadata: { sourceUrl: place.sourceUrl, rating: place.rating, userRatingCount: place.userRatingCount, latitude: place.latitude, longitude: place.longitude, photoNames: place.photoNames ?? [] } };
        const inserted = await catalog.from("places").upsert(row, { onConflict: "provider,provider_id", ignoreDuplicates: true }).select("id").maybeSingle();
        if (inserted.error) throw inserted.error;
        if (inserted.data) {
          saved = { data: inserted.data as { id: string } };
        } else {
          // Someone else inserted it between the read and the write: link theirs (it came through the same check).
          const raced = await catalog.from("places").select("id").eq("provider", place.provider).eq("provider_id", place.providerId).single();
          if (raced.error) throw raced.error;
          saved = { data: raced.data as { id: string } };
        }
      }
      // The link to this trip and the source note do not depend on each other: one round trip, not two.
      const [link, source] = await Promise.all([
        supabase.from("trip_places").upsert({ trip_id: tripId, place_id: saved.data.id, status: "saved" }),
        place.sourceUrl
          ? supabase.from("sources").upsert({ trip_id: tripId, entity_type: "place", entity_id: place.providerId, provider: place.provider, url: place.sourceUrl, retrieved_at: new Date().toISOString(), metadata: { rating: place.rating, userRatingCount: place.userRatingCount } }, { onConflict: "trip_id,entity_type,entity_id,provider" })
          : Promise.resolve({ error: null }),
      ]);
      if (link.error) throw link.error;
      if (source.error) throw source.error;
      return place;
    },
  };
}
