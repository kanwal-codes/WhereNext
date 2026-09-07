import type { SupabaseClient } from "@supabase/supabase-js";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";

/** Best-effort coordinates for a new itinerary stop — without these it can never show as a pin
 * on the Getting Around map (`coords()` there requires metadata.latitude/longitude directly; it
 * doesn't geocode on the fly the way the route-plan endpoint does). A lookup failure here just
 * means the stop is added without a pin, same as before this existed — never blocks the add. */
export async function geocodeStop(supabase: SupabaseClient, tripId: string, title: string, providerId?: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const places = new GooglePlacesProvider();
    if (providerId) {
      const detail = await places.details(providerId) as { location?: { latitude?: number; longitude?: number } };
      if (typeof detail.location?.latitude === "number" && typeof detail.location?.longitude === "number") {
        return { latitude: detail.location.latitude, longitude: detail.location.longitude };
      }
    }
    const trip = await supabase.from("trips").select("destination").eq("id", tripId).maybeSingle();
    const anchor = (trip.data as { destination?: string } | null)?.destination;
    const hit = (await places.search(anchor ? `${title}, ${anchor}` : title))[0];
    return hit ? { latitude: hit.latitude, longitude: hit.longitude } : null;
  } catch {
    return null;
  }
}
