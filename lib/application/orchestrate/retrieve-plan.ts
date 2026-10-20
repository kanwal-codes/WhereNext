import type { TripContext } from "@/lib/application/trip-context";
import { MAX_TOOL_CALLS, type ResolvedTurn } from "@/lib/application/turn-resolver";
import { currentTripDay, detectMealAsk, inferMealAnchor } from "@/lib/application/itinerary-anchor";
import type { retrieveEvidence } from "@/lib/application/retrieve";
import { routePlaceCalls } from "@/lib/application/route-calls";
import { effectiveStops } from "@/lib/trip-stops";
import { resolveCurrency } from "@/lib/currency";

export type Evidence = Awaited<ReturnType<typeof retrieveEvidence>>;

export function readStrList(preferences: Record<string, unknown>, key: string): string[] {
  const raw = preferences[key];
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}
export const readDislikes = (preferences: Record<string, unknown>): string[] => readStrList(preferences, "dislikes");

/** The provider calls this turn makes: RESOLVE's plan with places qualified by the trip's destination, trip dates filled in, a photo lookup when asked, and every city of a multi-city plan. */
export function planRetrieval(input: { resolved: ResolvedTurn; prompt: string; tripCtx: TripContext; locationFocus: string; caps: Set<ResolvedTurn["capabilities"][number]>; now: Date }) {
  const { resolved, prompt, tripCtx, locationFocus, caps, now } = input;
  // Guard against an ambiguous bare place name ("Belém" on a Lisbon trip): qualify
  // it with the trip destination before it reaches a provider.
  const anchor = tripCtx.trip?.destination;
  const qualify = (place: string) =>
    anchor && !place.includes(",") && !place.toLowerCase().includes(anchor.toLowerCase().split(",")[0].trim())
      ? `${place}, ${anchor}`
      : place;
  // The trip's real dates stand in when the model didn't name any.
  const tripStart = tripCtx.trip?.start_date ?? undefined;
  const tripEnd = tripCtx.trip?.end_date ?? undefined;
  const requestedImages = /\b(photo|photos|image|images|picture|pictures)\b/i.test(prompt);
  // Where the traveller will likely be for a meal ask made WHILE actually on the trip — biases
  // the search toward wherever the day already has them (a real, timed itinerary stop) instead
  // of just the hotel. Scoped tight on purpose: only the "food" intent, only a real meal keyword
  // in this message, only a day the trip is actually in, only a stop with a genuine set time —
  // see itinerary-anchor.ts for why each of those refuses to guess further. Anything short of
  // that just falls back to today's existing behavior (accommodation, or nothing).
  const mealAsk = resolved.intent === "food" ? detectMealAsk(prompt) : null;
  const mealDay = mealAsk ? currentTripDay(tripCtx.trip?.start_date, tripCtx.trip?.duration_days, now) : null;
  const mealAnchor = mealAsk && mealDay ? inferMealAnchor(tripCtx.itinerary, mealAsk, mealDay) : null;
  // Cap at the resolver's own MAX_TOOL_CALLS, not a smaller hardcoded number — the resolver's
  // plan can already be up to MAX_TOOL_CALLS long, and re-capping lower here silently dropped
  // whatever it planned beyond the first couple of entries (e.g. events/directions) whenever a
  // photo request also needed the synthetic search_places prepended.
  const plannedCalls = requestedImages && !resolved.toolPlan.some((call) => call.tool === "search_places")
    ? [{ tool: "search_places" as const, query: prompt.slice(0, 200), location: locationFocus }, ...resolved.toolPlan].slice(0, MAX_TOOL_CALLS)
    : resolved.toolPlan;
  const toolPlan = plannedCalls.map((call) =>
    call.tool === "search_places" ? { ...call, location: mealAnchor ? `${mealAnchor.title}, ${qualify(call.location)}` : qualify(call.location) }
      : call.tool === "directions" ? { ...call, from: qualify(call.from), to: qualify(call.to) }
      : call.tool === "stays" ? { ...call, location: qualify(call.location), checkin: call.checkin ?? tripStart ?? null, checkout: call.checkout ?? tripEnd ?? null }
      : call.tool === "flights" ? { ...call, departureDate: call.departureDate ?? tripStart ?? null }
      // weather/events get the same ambiguous-place-name guard as everything else here — an
      // unqualified "Belém" or "Cambridge" can resolve to the wrong one at the provider and the
      // reply presents that wrong-place data as the trip's own, with nothing to catch it.
      : call.tool === "weather" ? { ...call, location: qualify(call.location) }
      : call.tool === "events" ? { ...call, location: qualify(call.location) }
      : call,
  );
  // A plan for a whole multi-city trip searches every city on the route, not only the one the resolver picked.
  toolPlan.push(...routePlaceCalls({
    wantsItinerary: caps.has("itinerary"),
    requestedDays: resolved.itineraryDays,
    tripDays: tripCtx.trip?.duration_days,
    stops: effectiveStops(tripCtx.trip).stops,
    locationFocus,
    existing: toolPlan,
  }));
  return { anchor, qualify, tripStart, tripEnd, requestedImages, mealAnchor, toolPlan };
}

/** What every provider call is filtered by: the trip's tastes, currency, dates and the places the traveller already turned down. */
export function retrieveFiltersFor(tripCtx: TripContext, dislikes: string[]) {
  const rejectedNames = tripCtx.places
    .filter((entry) => entry.status === "rejected" && entry.place?.name)
    .map((entry) => entry.place!.name);
  const retrieveFilters = { dislikes, currency: resolveCurrency(tripCtx.preferences), country: typeof tripCtx.preferences.country === "string" ? tripCtx.preferences.country : undefined, interests: readStrList(tripCtx.preferences, "interests"), likes: readStrList(tripCtx.preferences, "likes"), tripStart: tripCtx.trip?.start_date, tripEnd: tripCtx.trip?.end_date, excludeNames: rejectedNames, travelers: tripCtx.trip?.travelers, accessibilityNeeds: readStrList(tripCtx.preferences, "accessibilityNeeds") };
  return retrieveFilters;
}

/** Whether any provider came back with something to ground a reply in. */
export const isGrounded = (result: Evidence) =>
  result.places.length > 0 || result.sources.length > 0 || result.routes.length > 0 || result.events.length > 0 || result.flights.length > 0 || result.stays.length > 0 || Boolean(result.weather);

/** The same plan with generic terms and the trip destination, for when an over-specific plan found nothing. */
export function broadenedPlan(toolPlan: ResolvedTurn["toolPlan"], intent: ResolvedTurn["intent"], anchor: string | null | undefined) {
  const generic: Record<string, string> = { food: "restaurants", nightlife: "bars", activities: "things to do", history_culture: "landmarks and museums" };
  return toolPlan.map((call) =>
    call.tool === "search_places" ? { ...call, query: generic[intent] ?? "top attractions", location: anchor ?? call.location }
      : call.tool === "events" ? { ...call, query: "", location: anchor ?? call.location }
      : call.tool === "research_web" ? { ...call, query: `${call.query} ${anchor ?? ""}`.trim() }
      : call,
  );
}
