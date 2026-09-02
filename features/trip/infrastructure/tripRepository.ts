import type { CreateTripInput, Trip } from "../domain/trip";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createTripRepository(supabase: SupabaseClient) { return {
  async create(userId: string, input: CreateTripInput): Promise<Trip> {
    const tripId = crypto.randomUUID();
    const { error } = await supabase.from("trips").insert({ id: tripId, owner_id: userId, name: input.name, destination: input.destination, origin: input.origin ?? null, duration_days: input.durationDays ?? null, travelers: input.travelerCount ?? null });
    if (error) throw error;
    const member = await supabase.from("trip_members").insert({ trip_id: tripId, user_id: userId, role: "owner" });
    if (member.error) throw member.error;
    const preferences = await supabase.from("trip_preferences").insert({ trip_id: tripId, data: input.preferences });
    if (preferences.error) throw preferences.error;
    const created = await supabase.from("trips").select("id,name,destination,origin,duration_days,travelers,preferences").eq("id", tripId).single();
    if (created.error) throw created.error;
    return created.data;
  },
  async get(id: string): Promise<Trip | null> {
    const result = await supabase.from("trips").select("id,name,destination,origin,duration_days,travelers,preferences").eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }
}; }
