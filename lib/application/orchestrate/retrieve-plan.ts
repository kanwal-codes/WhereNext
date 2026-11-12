import type { TripContext } from "@/lib/application/trip-context";
import { MAX_TOOL_CALLS, type ResolvedTurn } from "@/lib/application/turn-resolver";
import { currentTripDay, detectMealAsk, inferMealAnchor } from "@/lib/application/itinerary-anchor";
import type { retrieveEvidence } from "@/lib/application/retrieve";
import { planBreadth, routePlaceCalls } from "@/lib/application/route-calls";
import type { TripBrief } from "@/lib/application/trip-brief";
import type { RouteLeg } from "@/lib/application/trip-route";
import { effectiveStops } from "@/lib/trip-stops";
import { effectiveTripDays } from "@/features/trip/domain/trip";
import { resolveCurrency } from "@/lib/currency";

export type Evidence = Awaited<ReturnType<typeof retrieveEvidence>>;

export function readStrList(preferences: Record<string, unknown>, key: string): string[] {
  const raw = preferences[key];
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}
export const readDislikes = (preferences: Record<string, unknown>): string[] => readStrList(preferences, "dislikes");

/** Country names as English speakers write them, from the platform's own region data (no list to keep). */
const COUNTRY_NAMES = (() => {
  const names = new Set<string>(["usa", "uk", "uae", "holland", "england", "scotland", "wales", "great britain"]);
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    for (const a of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") for (const b of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const name = display.of(a + b);
      if (name && name !== a + b) names.add(name.toLowerCase());
    }
  } catch { /* no region data: only the short list above */ }
  return names;
})();
export const isCountry = (place: string) => COUNTRY_NAMES.has(place.trim().toLowerCase());

/** The provider calls this turn makes: RESOLVE's plan with places qualified by the trip's destination, trip dates filled in, a photo lookup when asked, and every city of a multi-city plan. */
export function planRetrieval(input: { resolved: ResolvedTurn; prompt: string; tripCtx: TripContext; locationFocus: string; caps: Set<ResolvedTurn["capabilities"][number]>; now: Date; brief?: TripBrief | null; /** The cities of a plan that spans places, with each one's own menu of kinds (same order). */ route?: RouteLeg[] | null; legBriefs?: Array<TripBrief | null> }) {
  const { resolved, prompt, tripCtx, locationFocus, caps, now, brief, route, legBriefs } = input;
  // Guard against an ambiguous bare place name ("Belém" on a Lisbon trip): qualify
  // it with the trip destination before it reaches a provider.
  const anchor = tripCtx.trip?.destination;
  // Only a name that could be a corner of the trip's own destination is qualified with it. A country stands alone: "Japan" on a
  // Toronto trip was becoming "Japan, Toronto, Ontario, Canada" and searched Toronto.
  const qualify = (place: string) =>
    anchor && !place.includes(",") && !isCountry(place) && !place.toLowerCase().includes(anchor.toLowerCase().split(",")[0].trim())
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
  const mealDay = mealAsk ? currentTripDay(tripCtx.trip?.start_date, effectiveTripDays(tripCtx.trip), now) : null;
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
    tripDays: effectiveTripDays(tripCtx.trip),
    stops: effectiveStops(tripCtx.trip).stops,
    locationFocus,
    existing: toolPlan,
  }));
  // A fresh plan (or one for a stated number of days) needs places of every kind, a few per day: widen the search.
  let placeLimit: number | undefined;
  if (caps.has("itinerary") && route && route.length >= 2 && (resolved.itineraryDays || !tripCtx.itinerary.length)) {
    // A route searches city by city: one national search ("things to do in Japan") zig-zags across the country. The router's own
    // country-wide searches are dropped, and the searches are shared out between the cities so a long route stays affordable.
    for (let i = toolPlan.length - 1; i >= 0; i--) {
      const call = toolPlan[i];
      if (call.tool === "search_places" && isCountry(call.location)) toolPlan.splice(i, 1);
    }
    const perCity = Math.min(7, Math.max(3, Math.floor(24 / route.length)));
    placeLimit = 0;
    route.forEach((leg, i) => {
      // Only what was already searched in THIS city counts as covered: another city's "museums" does not cover this one's.
      const here = qualify(leg.city);
      const breadth = planBreadth({ days: leg.days, existing: toolPlan.filter((call) => call.tool !== "search_places" || call.location === here), location: here, kinds: legBriefs?.[i]?.kinds, hasDates: false, maxSearches: perCity });
      placeLimit! += breadth.placeLimit;
      toolPlan.push(...breadth.calls);
    });
  } else if (caps.has("itinerary") && (resolved.itineraryDays || !tripCtx.itinerary.length)) {
    const breadth = planBreadth({ days: resolved.itineraryDays ?? effectiveTripDays(tripCtx.trip) ?? 3, existing: toolPlan, location: qualify(locationFocus), kinds: brief?.kinds, hasDates: Boolean(tripStart && tripEnd) });
    placeLimit = breadth.placeLimit;
    toolPlan.push(...breadth.calls);
  }
  return { anchor, qualify, tripStart, tripEnd, requestedImages, mealAnchor, toolPlan, placeLimit };
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

/** A plan that only reads the web: how a metro works, tipping, what an area is known for. With nothing found, the reply can still lean on well-established general knowledge, unlike places, prices or hours, which must come from a provider. */
export const isKnowledgeQuestion = (toolPlan: ResolvedTurn["toolPlan"]) => toolPlan.length > 0 && toolPlan.every((call) => call.tool === "research_web");

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
