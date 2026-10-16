import type { SupabaseClient } from "@supabase/supabase-js";
import { RESERVATION_COLUMNS, toReservation } from "@/packages/contracts/reservation";
import type { Trip } from "@/features/trip/domain/trip";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";

/**
 * Everything every trip page reads. Sent with each page and again after every change anywhere on the trip
 * (the refresh a mutation triggers), so it carries no chat history: that was ~60% of a 274 KB refresh on
 * pages that never show a message. Both chat surfaces load their own history from their own API route
 * (ConversationSurface reconciles against a session cache, GroupChatSurface refetches on mount), so
 * serving it from here only ever duplicated a request they make anyway.
 */
export type TripWorkspaceData = {
  trip: Trip;
  preferences: Record<string, unknown>;
  decisions: Array<Record<string, unknown>>;
  itinerary: Array<Record<string, unknown>>;
  savedPlaces: Array<Record<string, unknown>>;
  rejectedPlaceIds: string[];
  /** The text of Roam's latest replies, newest first: the Overview's notes. */
  recentNotes: string[];
  essentials: string[];
  reservations: Array<Record<string, unknown>>;
};

async function threadId(supabase: SupabaseClient, tripId: string, userId: string): Promise<string | null> {
  const thread = await supabase.from("conversation_threads").select("id").eq("trip_id", tripId).eq("user_id", userId).maybeSingle();
  if (thread.error) throw thread.error;
  return (thread.data?.id as string | undefined) ?? null;
}

export async function loadTripWorkspace(supabase: SupabaseClient, tripId: string, userId: string): Promise<TripWorkspaceData | null> {
  const recentNotes = (async () => {
    const id = await threadId(supabase, tripId, userId);
    if (!id) return [];
    const rows = await supabase.from("conversation_messages").select("content").eq("thread_id", id).eq("role", "assistant").order("created_at", { ascending: false }).limit(3);
    if (rows.error) throw rows.error;
    return (rows.data ?? []).map((row) => String(row.content ?? ""));
  })();
  // Nothing below depends on the trip row, so it joins the same fan-out (one round-trip).
  const [trip, preferences, decisions, itinerary, savedPlaces, rejectedPlaces, essentials, reservations, notes] = await Promise.all([
    createTripRepository(supabase).get(tripId),
    supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
    supabase.from("trip_decisions").select("id,kind,value,source,created_at").eq("trip_id", tripId).order("created_at", { ascending: false }),
    supabase.from("trip_itinerary_items").select("id,title,day_index,position,metadata,created_at").eq("trip_id", tripId).is("removed_at", null).order("day_index").order("position").order("created_at"),
    supabase.from("trip_places").select("status,places(id,name,provider,provider_id,category,address,metadata)").eq("trip_id", tripId).eq("status", "saved"),
    supabase.from("trip_places").select("places(provider_id)").eq("trip_id", tripId).eq("status", "rejected"),
    supabase.from("trip_essentials").select("completed").eq("trip_id", tripId).maybeSingle(),
    // Booked things travel with the workspace snapshot, so the Today view can show them (offline too).
    supabase.from("trip_reservations").select(RESERVATION_COLUMNS).eq("trip_id", tripId).order("starts_on", { ascending: true, nullsFirst: false }).limit(200),
    recentNotes,
  ]);
  if (!trip) return null;
  const error = preferences.error ?? decisions.error ?? itinerary.error ?? savedPlaces.error ?? rejectedPlaces.error ?? essentials.error ?? reservations.error;
  if (error) throw error;
  const rejectedPlaceIds = ((rejectedPlaces.data ?? []) as Array<{ places?: { provider_id?: string } | null }>)
    .map((row) => row.places?.provider_id)
    .filter((id): id is string => Boolean(id));
  return { trip, preferences: preferences.data?.data ?? {}, decisions: decisions.data ?? [], itinerary: itinerary.data ?? [], savedPlaces: savedPlaces.data ?? [], rejectedPlaceIds, recentNotes: notes, essentials: essentials.data?.completed ?? [], reservations: (reservations.data ?? []).map(toReservation) as unknown as Array<Record<string, unknown>> };
}
