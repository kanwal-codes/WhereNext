import { GROUP_HISTORY_LIMIT } from "@/features/group-chat/domain/message";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RESERVATION_COLUMNS, toReservation } from "@/packages/contracts/reservation";
import type { Trip } from "@/features/trip/domain/trip";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { createGroupChatRepository } from "@/features/group-chat/infrastructure/groupChatRepository";

export type TripWorkspaceData = { trip: Trip; preferences: Record<string, unknown>; decisions: Array<Record<string, unknown>>; itinerary: Array<Record<string, unknown>>; savedPlaces: Array<Record<string, unknown>>; rejectedPlaceIds: string[]; conversation: Array<Record<string, unknown>>; groupChat: Array<Record<string, unknown>>; essentials: string[]; reservations: Array<Record<string, unknown>> };

export async function loadTripWorkspace(supabase: SupabaseClient, tripId: string, userId: string): Promise<TripWorkspaceData | null> {
  const conversation = (async () => { const thread = await supabase.from("conversation_threads").select("id").eq("trip_id", tripId).eq("user_id", userId).maybeSingle(); if (thread.error) throw thread.error; if (!thread.data) return []; const messages = await supabase.from("conversation_messages").select("id,role,content,created_at,metadata").eq("thread_id", thread.data.id).order("created_at", { ascending: false }).limit(200); if (messages.error) throw messages.error; return (messages.data ?? []).reverse(); })();
  // Server-rendered alongside everything else so GroupChatSurface opens with its history already
  // in hand — matching the personal conversation thread's own treatment above. Without this, the
  // group chat had no equivalent to `conversation`, so every mount (including crossing back from
  // a different route group, like /group/details) started from an empty list and a visible fetch.
  const groupChat = createGroupChatRepository(supabase).list(tripId, userId, { limit: GROUP_HISTORY_LIMIT });
  // Nothing below depends on the trip row, so it joins the same fan-out (8 wide, one round-trip).
  const [trip, preferences, decisions, itinerary, savedPlaces, rejectedPlaces, essentials, reservations, conversationData, groupChatData] = await Promise.all([
    createTripRepository(supabase).get(tripId),
    supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
    supabase.from("trip_decisions").select("id,kind,value,source,created_at").eq("trip_id", tripId).order("created_at", { ascending: false }),
    supabase.from("trip_itinerary_items").select("id,title,day_index,position,metadata,created_at").eq("trip_id", tripId).is("removed_at", null).order("day_index").order("position").order("created_at"),
    supabase.from("trip_places").select("status,places(id,name,provider,provider_id,category,address,metadata)").eq("trip_id", tripId).eq("status", "saved"),
    supabase.from("trip_places").select("places(provider_id)").eq("trip_id", tripId).eq("status", "rejected"),
    supabase.from("trip_essentials").select("completed").eq("trip_id", tripId).maybeSingle(),
    // Booked things travel with the workspace snapshot, so the Today view can show them (offline too).
    supabase.from("trip_reservations").select(RESERVATION_COLUMNS).eq("trip_id", tripId).order("starts_on", { ascending: true, nullsFirst: false }).limit(200),
    conversation,
    groupChat,
  ]);
  if (!trip) return null;
  const error = preferences.error ?? decisions.error ?? itinerary.error ?? savedPlaces.error ?? rejectedPlaces.error ?? essentials.error ?? reservations.error;
  if (error) throw error;
  const rejectedPlaceIds = ((rejectedPlaces.data ?? []) as Array<{ places?: { provider_id?: string } | null }>)
    .map((row) => row.places?.provider_id)
    .filter((id): id is string => Boolean(id));
  return { trip, preferences: preferences.data?.data ?? {}, decisions: decisions.data ?? [], itinerary: itinerary.data ?? [], savedPlaces: savedPlaces.data ?? [], rejectedPlaceIds, conversation: conversationData, groupChat: groupChatData, essentials: essentials.data?.completed ?? [], reservations: (reservations.data ?? []).map(toReservation) as unknown as Array<Record<string, unknown>> };
}
