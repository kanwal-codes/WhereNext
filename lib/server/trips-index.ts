import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripSummary } from "@/components/TripsHome";

export type TripsIndexData = { userId: string; displayName: string; trips: TripSummary[] };

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
    .select("id,name,destination,origin,duration_days,start_date,end_date,travelers")
    .order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  return { userId: user.id, displayName, trips: (result.data ?? []) as TripSummary[] };
}
