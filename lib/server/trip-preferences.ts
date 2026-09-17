import type { SupabaseClient } from "@supabase/supabase-js";
import { preferencesSchema } from "@/packages/contracts/preferences";

export type PreferencesRow = { data: Record<string, unknown>; updated_at: string };

/**
 * Read-modify-write `trip_preferences` with optimistic concurrency, retrying on a lost race.
 * A group trip can have several members (or the assistant acting on their behalf) updating
 * preferences within the same window — a blind select-then-upsert silently drops whichever
 * write lands second. `updated_at` is trigger-maintained (0001_core.sql's
 * `trip_preferences_set_updated_at`), so it's a valid CAS token the same way `trips.updated_at`
 * already is (trip-update-handling.ts's `applyTripUpdate`).
 */
export async function updateTripPreferences(
  supabase: SupabaseClient,
  tripId: string,
  updater: (previous: Record<string, unknown>) => Record<string, unknown>,
  maxAttempts = 5,
): Promise<PreferencesRow> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const existing = await supabase.from("trip_preferences").select("data,updated_at").eq("trip_id", tripId).maybeSingle();
    if (existing.error) throw existing.error;
    const merged = preferencesSchema.parse(updater((existing.data?.data ?? {}) as Record<string, unknown>));

    if (existing.data) {
      const result = await supabase
        .from("trip_preferences")
        .update({ data: merged })
        .eq("trip_id", tripId)
        .eq("updated_at", existing.data.updated_at)
        .select("data,updated_at")
        .maybeSingle();
      if (result.error) throw result.error;
      if (result.data) return result.data as PreferencesRow;
      continue; // someone else updated between our read and write — reread and remerge
    }

    const inserted = await supabase.from("trip_preferences").insert({ trip_id: tripId, data: merged }).select("data,updated_at").maybeSingle();
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error; // unique_violation: a concurrent insert won
      continue;
    }
    if (inserted.data) return inserted.data as PreferencesRow;
  }
  throw new Error(`trip_preferences update for trip ${tripId} lost the concurrency race ${maxAttempts} times in a row`);
}
