import type { SupabaseClient } from "@supabase/supabase-js";
import { tripDurationDays, type ParsedTrip } from "@/features/trip/domain/trip";
import { parseTripPrompt } from "@/lib/application/parse-trip";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

type TripRow = {
  name: string | null;
  destination: string | null;
  origin: string | null;
  travelers: number | null;
  duration_days: number | null;
  start_date: string | null;
  end_date: string | null;
};

/**
 * What a read of the visitor's sentence may add to a trip that was created blank: only fields
 * that are still empty, so it can never overwrite something Roam's first turn (or the visitor)
 * has already set in the meantime. The name only replaces the automatic "New trip".
 */
export function blankTripFields(current: TripRow, fields: ParsedTrip): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (fields.name && (!current.name || current.name.startsWith("New trip"))) update.name = fields.name;
  if (fields.destination && !current.destination) update.destination = fields.destination;
  if (fields.origin && !current.origin) update.origin = fields.origin;
  if (fields.travelerCount && current.travelers == null) update.travelers = fields.travelerCount;
  const datesFree = !current.start_date && !current.end_date;
  if (datesFree && fields.startDate && fields.endDate && fields.endDate >= fields.startDate) {
    update.start_date = fields.startDate;
    update.end_date = fields.endDate;
    update.duration_days = tripDurationDays(fields.startDate, fields.endDate);
  } else if (fields.durationDays && current.duration_days == null) {
    update.duration_days = fields.durationDays;
  }
  return update;
}

/** Reads the sentence with the model and fills the trip's blanks. Runs after the response, so the
 *  visitor is already in the chat; the sidebar updates itself when the trip row changes. */
export async function enrichTripFromPrompt(supabase: SupabaseClient, tripId: string, prompt: string): Promise<void> {
  const fields = await parseTripPrompt(prompt);
  const current = await supabase
    .from("trips")
    .select("name,destination,origin,travelers,duration_days,start_date,end_date")
    .eq("id", tripId)
    .maybeSingle();
  if (current.error || !current.data) return;
  const update = blankTripFields(current.data as TripRow, fields);
  if (Object.keys(update).length === 0) return;
  const result = await supabase.from("trips").update(update).eq("id", tripId);
  if (!result.error) invalidateWorkspace(tripId);
}
