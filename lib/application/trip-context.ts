import type { SupabaseClient } from "@supabase/supabase-js";
import { readStayDecision, type StayDecision } from "@/packages/contracts/stay";

export type TripContext = {
  trip: { name: string; destination: string | null; origin: string | null; duration_days: number | null; start_date: string | null; end_date: string | null; travelers: number | null } | null;
  preferences: Record<string, unknown>;
  itinerary: Array<{ title: string; day_index: number; position?: number; locked: boolean; latitude?: number; longitude?: number }>;
  lockedTitles: string[];
  /** The locked stay first (when it has coordinates), then locked itinerary items — the anchors for "distance from" on cards. */
  lockedPlaces: Array<{ title: string; latitude: number; longitude: number }>;
  lockedStay: StayDecision | null;
  places: Array<{ status: string; place: { name: string; category: string | null; address: string | null } | null }>;
  decisions: Array<{ kind: string; value: unknown; source: string; created_at: string }>;
};

const coord = (metadata: Record<string, unknown> | null, key: "latitude" | "longitude"): number | undefined => {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const MAX_CONTEXT_CHARS = 20_000;

/** Durable trip state the assistant is allowed to see. One query set, reused by every AI route. */
export async function loadTripContext(supabase: SupabaseClient, tripId: string): Promise<TripContext> {
  const [trip, preferences, itinerary, places, decisions] = await Promise.all([
    supabase.from("trips").select("name,destination,origin,duration_days,start_date,end_date,travelers").eq("id", tripId).maybeSingle(),
    supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
    supabase.from("trip_itinerary_items").select("title,day_index,position,metadata").eq("trip_id", tripId).is("removed_at", null).order("day_index").order("position").limit(50),
    supabase.from("trip_places").select("status,places(name,category,address)").eq("trip_id", tripId).limit(50),
    supabase.from("trip_decisions").select("kind,value,source,created_at").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(30),
  ]);
  const error = trip.error ?? preferences.error ?? itinerary.error ?? places.error ?? decisions.error;
  if (error) throw error;
  const items = (itinerary.data ?? []).map((item) => {
    const metadata = item.metadata as Record<string, unknown> | null;
    return {
      title: item.title,
      day_index: item.day_index,
      position: typeof item.position === "number" ? item.position : 0,
      locked: metadata?.locked === true,
      latitude: coord(metadata, "latitude"),
      longitude: coord(metadata, "longitude"),
    };
  });
  // "suggestion" rows are the assistant's own pending guesses — they must not read back as confirmed facts.
  const decisionRows = ((decisions.data ?? []) as TripContext["decisions"]).filter((d) => d.kind !== "suggestion");
  const lockedStay = readStayDecision(decisionRows);
  const stayAnchor = lockedStay && lockedStay.latitude != null && lockedStay.longitude != null
    ? [{ title: lockedStay.hotelName, latitude: lockedStay.latitude, longitude: lockedStay.longitude }]
    : [];
  return {
    trip: trip.data ?? null,
    preferences: (preferences.data?.data ?? {}) as Record<string, unknown>,
    itinerary: items,
    lockedTitles: items.filter((item) => item.locked).map((item) => item.title),
    lockedPlaces: [
      ...stayAnchor,
      ...items
        .filter((item) => item.locked && item.latitude !== undefined && item.longitude !== undefined)
        .map((item) => ({ title: item.title, latitude: item.latitude as number, longitude: item.longitude as number })),
    ],
    lockedStay,
    places: (places.data ?? []).map((item) => {
      const place = Array.isArray(item.places) ? item.places[0] : item.places;
      return { status: item.status, place: place ? { name: place.name, category: place.category, address: place.address } : null };
    }),
    decisions: decisionRows,
  };
}

/** JSON for the system prompt, trimmed progressively so a large trip cannot blow the context budget. */
export function serializeTripContext(context: TripContext): string {
  const full = JSON.stringify(context);
  if (full.length <= MAX_CONTEXT_CHARS) return full;
  const reduced = JSON.stringify({
    ...context,
    itinerary: context.itinerary.slice(0, 20),
    places: context.places.slice(0, 20),
    decisions: context.decisions.slice(0, 15),
  });
  if (reduced.length <= MAX_CONTEXT_CHARS) return reduced;
  const compactPreferences = Object.fromEntries(
    Object.entries(context.preferences).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).slice(0, 40),
  );
  return JSON.stringify({
    trip: context.trip
      ? { name: context.trip.name, destination: context.trip.destination, start_date: context.trip.start_date, end_date: context.trip.end_date }
      : null,
    preferences: compactPreferences,
    itinerary: [],
    lockedTitles: context.lockedTitles,
    places: [],
    decisions: context.decisions.slice(0, 10),
  });
}

const asList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
    .map((entry) => String(entry).trim())
    .filter(Boolean);

/** Human-readable one-liner of what the trip contains so far, for the system prompt and the resolver. */
export function formatTripMemory(
  context: Pick<TripContext, "preferences" | "itinerary" | "places" | "decisions" | "lockedTitles"> & { trip?: TripContext["trip"] },
): string {
  const preferences = context.preferences ?? {};
  const likes = Array.from(new Set([...asList(preferences.interests), ...asList(preferences.likes)]));
  const dislikes = asList(preferences.dislikes);
  const dietary = asList(preferences.dietaryNeeds);
  const profile = [
    context.trip ? `trip: ${context.trip.name}; destination: ${context.trip.destination || "undecided"}; origin: ${context.trip.origin || "undecided"}` : null,
    context.trip?.duration_days != null ? `duration: ${context.trip.duration_days} days` : null,
    context.trip?.travelers != null ? `travellers: ${context.trip.travelers}` : null,
    context.trip ? `dates: ${context.trip.start_date || "undecided"}${context.trip.end_date ? ` to ${context.trip.end_date}` : ""}` : null,
    typeof preferences.currency === "string" ? `currency: ${preferences.currency}` : null,
    typeof preferences.groupType === "string" && preferences.groupType ? `group: ${preferences.groupType}` : null,
    preferences.budget !== undefined && preferences.budget !== "" ? `budget: ${preferences.budget}` : null,
    typeof preferences.pace === "string" && preferences.pace ? `pace: ${preferences.pace}` : null,
    likes.length ? `likes: ${likes.join(", ")}` : null,
    dislikes.length ? `dislikes: ${dislikes.join(", ")}` : null,
    dietary.length ? `dietary: ${dietary.join(", ")}` : null,
  ].filter(Boolean);

  const itinerary = context.itinerary
    // day_index is 1-based everywhere it's written (add_itinerary_item, placement, the itinerary route).
    .map((item) => (item.title ? `${item.title}${typeof item.day_index === "number" ? ` (day ${item.day_index})` : ""}${item.locked ? " [locked]" : ""}` : ""))
    .filter(Boolean);
  const savedPlaces = context.places
    .map((item) => (item.place?.name ? `${item.place.name} [${item.status ?? "saved"}]` : ""))
    .filter(Boolean);
  const stay = readStayDecision(context.decisions);
  const decisions = context.decisions
    .filter((item) => !["stay", "review_notified", "review_dismissed"].includes(item.kind))
    .map((item) => (item.kind ? `${item.kind}: ${typeof item.value === "string" ? item.value : JSON.stringify(item.value)}` : ""))
    .filter(Boolean);

  return [
    profile.length ? `Profile — ${profile.join("; ")}.` : "Profile: not filled in yet.",
    stay ? `Stay: ${stay.hotelName}, ${stay.roomName}, ${stay.checkin}→${stay.checkout}, ${stay.totalAmount} ${stay.currency}.` : "Stay: not locked yet.",
    itinerary.length ? `Itinerary: ${itinerary.join(", ")}.` : "Itinerary: nothing added yet.",
    savedPlaces.length ? `Saved places: ${savedPlaces.join(", ")}.` : "Saved places: none yet.",
    decisions.length ? `Decisions: ${decisions.join("; ")}.` : "Decisions: none recorded yet.",
  ].join(" ");
}
