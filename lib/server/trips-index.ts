import { decodeCover } from "@/lib/cover-photo";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripSummary } from "@/components/TripsHome";
import { firstSavedPhotoByTrip } from "@/lib/trip-cover";

export type TripsIndexData = { userId: string; displayName: string; isAnonymous: boolean; trips: TripSummary[] };

/**
 * The auth check + trip list `/trips` needs. Shared with `/` (the root page) so a signed-in
 * user landing on `/` doesn't pay for two sequential `auth.getUser()` round trips — one to
 * decide whether to redirect, then a second one on `/trips` itself after the redirect lands.
 * Returns null for a signed-out visitor (never redirects itself — each caller decides where to
 * send a signed-out visitor, since `/` shows the public landing page and `/trips` sends them to
 * sign-in).
 */
export async function loadTripsIndex(supabase: SupabaseClient): Promise<TripsIndexData | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as { name?: string; full_name?: string };
  const displayName = meta.name || meta.full_name || user.email?.split("@")[0] || "Traveller";
  const result = await supabase
    .from("trips")
    .select("id,name,destination,origin,duration_days,start_date,end_date,travelers,hero_photo_name,owner_id")
    .order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  const trips = ((result.data ?? []) as Array<TripSummary & { owner_id?: string | null }>).map(({ owner_id, ...trip }) => ({ ...trip, is_owner: owner_id === user.id }));

  // Second choice for a cover photo: a place the group saved to the trip. Only asked for trips
  // that have no destination photo, in one query for all of them. Best-effort: a failure here just
  // means those trips fall back to the type-led cover.
  const needCover = trips.filter((trip) => !decodeCover(trip.hero_photo_name).name).map((trip) => trip.id);
  if (needCover.length > 0) {
    const saved = await supabase
      .from("trip_places")
      .select("trip_id, places(metadata)")
      .in("trip_id", needCover)
      .eq("status", "saved")
      .order("created_at", { ascending: false });
    if (!saved.error) {
      const photos = firstSavedPhotoByTrip((saved.data ?? []) as unknown as Parameters<typeof firstSavedPhotoByTrip>[0]);
      for (const trip of trips) trip.saved_photo_name = photos.get(trip.id) ?? null;
    }
  }
  return { userId: user.id, displayName, isAnonymous: user.is_anonymous === true, trips };
}
