import { findStop, type TripStop } from "@/lib/trip-stops";
import type { ToolCall } from "./turn-resolver";
import { pickKinds, type TripKind } from "./trip-brief";

type PlaceCall = { tool: "search_places"; query: string; location: string };
type EventsCall = Extract<ToolCall, { tool: "events" }>;

/**
 * A plan for a whole multi-city trip needs places from every city, not just the one the resolver happened to
 * search. Returns one extra place search per city the plan does not already cover. Nothing is added when the
 * request is about one city or a stretch of days, the trip is one city, or the plan is not an itinerary.
 */
export function routePlaceCalls(input: {
  wantsItinerary: boolean;
  requestedDays: number | null | undefined;
  tripDays: number | null | undefined;
  stops: TripStop[];
  locationFocus: string | null | undefined;
  existing: Array<{ tool: string; location?: string | null }>;
  max?: number;
}): PlaceCall[] {
  const { stops, existing } = input;
  if (!input.wantsItinerary || stops.length < 2) return [];
  // "Plan our Rome days" or "Jun 11 and 12": one city's worth of days, not the trip.
  const wholeTrip = !input.requestedDays || !input.tripDays || input.requestedDays >= Math.ceil(input.tripDays * 0.6);
  if (!wholeTrip) return [];
  // A focus on exactly one city of the route means the question is about that city.
  const named = input.locationFocus ? stops.filter((s) => findStop([s], input.locationFocus) !== null) : [];
  if (named.length === 1) return [];
  const covered = existing.filter((c) => c.tool === "search_places").map((c) => (c.location ?? "").toLowerCase());
  return stops
    .filter((s) => !covered.some((loc) => loc.includes(s.city.toLowerCase())))
    .slice(0, input.max ?? 5)
    .map((s) => ({ tool: "search_places" as const, query: "top sights and well-reviewed restaurants", location: s.city }));
}

// When there is no trip brief (the model call failed), a plan still gets a few kinds of place instead of one search's worth.
// Live-caught: a Toronto plan came back as 3 days because only twelve places were ever in play, mostly restaurants.
const FALLBACK_LANES: Array<{ covers: RegExp; query: string }> = [
  { covers: /sight|landmark|attraction|things to do|top /i, query: "top sights and landmarks" },
  { covers: /restaurant|food|eat|cafe|dinner|lunch|brunch|dining|cuisine/i, query: "well-reviewed restaurants and cafes" },
  { covers: /park|trail|hike|outdoor|nature|garden|beach/i, query: "parks, trails and outdoor activities" },
  { covers: /museum|gallery|art|history|culture/i, query: "museums and galleries" },
  { covers: /market|neighbou?rhood|shopping|stroll/i, query: "markets and neighbourhoods to explore" },
  { covers: /bar|nightlife|club|pub|brewery/i, query: "bars and nightlife" },
];
const STOPS_PER_DAY = 5;
const MAX_EVENT_CALLS = 3;
const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Breadth for a fresh day-by-day plan: how many places to keep (a few per day, with slack for the ones the no-repeat and
 * place-matching rules drop), one place search per kind in the trip brief, and, when the trip has dates, event searches
 * for the kinds that have them plus one broad "what's on". Kinds the conversation already searched are not repeated.
 */
export function planBreadth(input: {
  days: number;
  existing: Array<{ tool: string; query?: string | null }>;
  location: string;
  kinds?: TripKind[] | null;
  hasDates?: boolean;
  /** At most this many place searches (a plan across several cities shares one budget of searches between them). */
  maxSearches?: number;
}): { placeLimit: number; calls: Array<PlaceCall | EventsCall> } {
  const days = Math.min(Math.max(input.days, 1), 30);
  const searched = input.existing.filter((c) => c.tool === "search_places").map((c) => norm(c.query ?? ""));
  const known = (query: string) => searched.some((q) => q === norm(query));
  const calls: Array<PlaceCall | EventsCall> = [];
  const kinds = input.kinds?.length ? pickKinds(input.kinds, days) : [];
  if (kinds.length) {
    for (const kind of kinds) if (kind.placeQuery && !known(kind.placeQuery)) calls.push({ tool: "search_places", query: kind.placeQuery, location: input.location });
  } else {
    const want = days >= 7 ? 6 : 3;
    FALLBACK_LANES.filter((lane) => !input.existing.some((c) => c.tool === "search_places" && lane.covers.test(c.query ?? "")))
      .slice(0, Math.max(0, want - searched.length))
      .forEach((lane) => calls.push({ tool: "search_places", query: lane.query, location: input.location }));
  }
  if (input.maxSearches !== undefined) calls.splice(input.maxSearches);
  if (input.hasDates && !input.existing.some((c) => c.tool === "events")) {
    // From every kind in the brief, not just the ones picked for place searches: an events search is cheap and a lesser kind (a match, a festival) is exactly what makes a date special.
    const categories = [...new Set([...(input.kinds ?? [])].sort((a, b) => b.weight - a.weight).map((kind) => kind.eventQuery).filter(Boolean))].slice(0, MAX_EVENT_CALLS);
    for (const category of [null, ...categories]) calls.push({ tool: "events", query: "", location: input.location, artist: null, category, dateScoped: true });
  }
  return { placeLimit: Math.max(12, days * STOPS_PER_DAY), calls };
}
