import type { SupabaseClient } from "@supabase/supabase-js";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { cached } from "@/lib/server/ttl-cache";

/** The destination string's own coordinates, biasing the per-stop search that follows — same
 *  Phase 4 locationBias fix (docs/overhaul/roadmap/phase-4-recommendation-ranking.md), now
 *  extended to both this file's own `geocodeStop` and `route-plan/route.ts`'s `coordsFor`: a
 *  same-named stop existing in more than one city is a real possibility ("Central Park" is not
 *  unique to New York), and nothing previously told Google which one a trip's own destination
 *  means. Cached 24h per destination string, shared across both callers — a trip's destination
 *  doesn't change between an itinerary add and a route-plan request for the same trip. */
export async function destinationBias(places: GooglePlacesProvider, destination: string): Promise<{ lat: number; lng: number } | undefined> {
  return cached(`geocode-stop:dest:${destination.trim().toLowerCase()}`, 24 * 60 * 60_000, async () => {
    const [hit] = await places.search(destination, undefined, 1);
    if (!hit) throw new Error(`could not geocode destination "${destination}"`); // not cached — see cached()'s own contract
    return { lat: hit.latitude, lng: hit.longitude };
  }).catch(() => undefined);
}

/** Best-effort coordinates for a new itinerary stop — without these it can never show as a pin
 * on the Getting Around map (`coords()` there requires metadata.latitude/longitude directly; it
 * doesn't geocode on the fly the way the route-plan endpoint does). A lookup failure here just
 * means the stop is added without a pin, same as before this existed — never blocks the add. */
export async function geocodeStop(supabase: SupabaseClient, tripId: string, title: string, providerId?: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const places = new GooglePlacesProvider();
    if (providerId) {
      const detail = await places.details(providerId, undefined, "light") as { location?: { latitude?: number; longitude?: number } };
      if (typeof detail.location?.latitude === "number" && typeof detail.location?.longitude === "number") {
        return { latitude: detail.location.latitude, longitude: detail.location.longitude };
      }
    }
    const trip = await supabase.from("trips").select("destination").eq("id", tripId).maybeSingle();
    const anchor = (trip.data as { destination?: string } | null)?.destination;
    const locationBias = anchor ? await destinationBias(places, anchor) : undefined;
    const hit = (await places.search(anchor ? `${title}, ${anchor}` : title, undefined, undefined, locationBias))[0];
    return hit ? { latitude: hit.latitude, longitude: hit.longitude } : null;
  } catch {
    return null;
  }
}
