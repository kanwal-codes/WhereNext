import { findStop, type TripStop } from "@/lib/trip-stops";

type PlaceCall = { tool: "search_places"; query: string; location: string };

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
