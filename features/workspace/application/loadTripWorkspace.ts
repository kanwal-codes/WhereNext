import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip } from "@/features/trip/domain/trip";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";

export type TripWorkspaceData = { trip: Trip; preferences: Record<string, unknown>; decisions: Array<Record<string, unknown>>; itinerary: Array<Record<string, unknown>>; savedPlaces: Array<Record<string, unknown>>; conversation: Array<Record<string, unknown>>; essentials: string[] };

export async function loadTripWorkspace(supabase: SupabaseClient, tripId: string): Promise<TripWorkspaceData | null> {
  const conversation = (async () => { const thread = await supabase.from("conversation_threads").select("id").eq("trip_id", tripId).maybeSingle(); if (thread.error) throw thread.error; if (!thread.data) return []; const messages = await supabase.from("conversation_messages").select("id,role,content,created_at,metadata").eq("thread_id", thread.data.id).order("created_at", { ascending: true }).limit(200); if (messages.error) throw messages.error; return messages.data ?? []; })();
  // Nothing below depends on the trip row, so it joins the same fan-out (7 wide, one round-trip).
  const [trip, preferences, decisions, itinerary, savedPlaces, essentials, conversationData] = await Promise.all([
    createTripRepository(supabase).get(tripId),
    supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
    supabase.from("trip_decisions").select("id,kind,value,source,created_at").eq("trip_id", tripId).order("created_at", { ascending: false }),
    supabase.from("trip_itinerary_items").select("id,title,day_index,position,metadata,created_at").eq("trip_id", tripId).is("removed_at", null).order("day_index").order("position").order("created_at"),
    supabase.from("trip_places").select("status,places(id,name,provider,provider_id,category,address,metadata)").eq("trip_id", tripId).eq("status", "saved"),
    supabase.from("trip_essentials").select("completed").eq("trip_id", tripId).maybeSingle(),
    conversation,
  ]);
  if (!trip) return null;
  const error = preferences.error ?? decisions.error ?? itinerary.error ?? savedPlaces.error ?? essentials.error;
  if (error) throw error;
  return { trip, preferences: preferences.data?.data ?? {}, decisions: decisions.data ?? [], itinerary: itinerary.data ?? [], savedPlaces: savedPlaces.data ?? [], conversation: conversationData, essentials: essentials.data?.completed ?? [] };
}
