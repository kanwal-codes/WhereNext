import { tripDurationDays, type CreateTripInput, type Trip } from "../domain/trip";
import type { SupabaseClient } from "@supabase/supabase-js";

const COLUMNS = "id,name,destination,origin,duration_days,start_date,end_date,travelers,preferences";

export function createTripRepository(supabase: SupabaseClient) { return {
  async create(userId: string, input: CreateTripInput): Promise<Trip> {
    const tripId = crypto.randomUUID();
    // When we have a real date pair, the length is derived from it; otherwise use the stated length.
    const durationDays = tripDurationDays(input.startDate, input.endDate) ?? input.durationDays ?? null;
    const { error } = await supabase.from("trips").insert({ id: tripId, owner_id: userId, name: input.name, destination: input.destination, origin: input.origin ?? null, duration_days: durationDays, start_date: input.startDate ?? null, end_date: input.endDate ?? null, travelers: input.travelerCount ?? null });
    if (error) throw error;
    const member = await supabase.from("trip_members").insert({ trip_id: tripId, user_id: userId, role: "owner" });
    if (member.error) throw member.error;
    const preferences = await supabase.from("trip_preferences").insert({ trip_id: tripId, data: input.preferences });
    if (preferences.error) throw preferences.error;
    const created = await supabase.from("trips").select(COLUMNS).eq("id", tripId).single();
    if (created.error) throw created.error;
    return created.data;
  },
  async get(id: string): Promise<Trip | null> {
    const result = await supabase.from("trips").select(COLUMNS).eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }
}; }
