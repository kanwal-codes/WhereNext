import type { Place } from "@/packages/contracts/place";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import type { WeatherDay } from "@/packages/providers/openweather/client";
import type { FlightOffer } from "@/packages/providers/duffel/client";
import type { StayOption, StayRoom } from "@/packages/contracts/stay";
import { cached } from "@/lib/server/ttl-cache";
import { logger } from "@/lib/server/logger";
import { rankPlaces } from "./rank-places";
import { filterByPreferences } from "./preference-filter";
import { classifyPlaceVibe } from "@/packages/reco/vibes";
import type { RetrieveContext, RetrieveFilters } from "./retrieve/context";
export type { RetrieveFilters } from "./retrieve/context";
import { handleSearchPlaces } from "./retrieve/handlers/search-places";
import { handleResearchWeb } from "./retrieve/handlers/research-web";
import { handleEvents } from "./retrieve/handlers/events";
import type { PriceInsights } from "@/packages/providers/serpapi/client";
import { handleFlights } from "./retrieve/handlers/flights";
import { handleStays } from "./retrieve/handlers/stays";
import { handleWeather } from "./retrieve/handlers/weather";
import { handleDirections } from "./retrieve/handlers/directions";
import type { ToolCall } from "./turn-resolver";

/** Tool → handler dispatch table (Phase 1.2, docs/overhaul/roadmap/phase-1-structural-refactor.md).
 *  Exhaustive mapped type over every tool — the compiler refuses to build if a new tool is added
 *  to `ToolCall` without a handler registered here for it, sub-phase 1.2.8's exhaustiveness gate. */
const HANDLERS: { [K in ToolCall["tool"]]: (call: Extract<ToolCall, { tool: K }>, ctx: RetrieveContext, index: number) => Promise<void> } = {
  search_places: handleSearchPlaces,
  research_web: handleResearchWeb,
  events: handleEvents,
  flights: handleFlights,
  stays: handleStays,
  weather: handleWeather,
  directions: handleDirections,
};

export type EventResult = {
  title: string;
  url: string;
  date?: string;
  venue?: string;
  source: string;
  imageUrl?: string;
  /** How big the event is for the area (0–100) + predicted attendance, when a provider supplies
   *  it. No currently-wired provider sets this — PredictHQ was the only source and has been
   *  removed (paid, not worth it at this scale) — kept as a general prominence field rather than
   *  torn out, since `eventPopularity()` below already has a heuristic fallback for its absence. */
  rank?: number;
  attendance?: number;
  /** ISO YYYY-MM-DD, when the provider gave a parseable date. */
  startDate?: string;
  /** Where the date falls relative to the trip window (only set when the turn is date-scoped). */
  relToTrip?: "in" | "before" | "after";
  /** Days from the trip edge — 0 for "in", N for "before" (arrive − date) / "after" (date − depart). */
  offsetDays?: number;
};
export type FlightSearch = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  assumedDate: boolean;
  offers: FlightOffer[];
  /** Google Flights ids for the two ends and its read on the price, when that is where the fares came from. */
  originId?: string;
  destinationId?: string;
  insights?: PriceInsights | null;
  provider?: "serpapi" | "duffel";
};
export type StaySearch = {
  location: string;
  checkin: string;
  checkout: string;
  nights: number;
  assumedDates: boolean;
  options: StayOption[];
  adults?: number;
  provider?: "serpapi" | "liteapi";
  detail?: { hotelName: string; rooms: StayRoom[] };
};

export type RouteResult = {
  from: string;
  to: string;
  mode: "transit" | "walking" | "driving";
  distanceMeters: number;
  durationSeconds: number;
  steps: string[];
  departureTime?: string;
  arrivalTime?: string;
  /** The route's line as [lng, lat], thinned, so a chat reply can show it on a map. */
  path?: Array<[number, number]>;
  fare?: { amount: number; currency: string };
};

export type RetrievedEvidence = {
  places: Place[];
  /** Results kept in the same topical lanes the resolver requested. */
  placeGroups?: Array<{ label: string; places: Place[] }>;
  sources: Array<{ title: string; url: string; content: string }>;
  weather: string | null;
  /** Per-day forecast buckets — only when the trip is inside the forecast window. */
  weatherDays?: WeatherDay[];
  routes: RouteResult[];
  events: EventResult[];
  flights: FlightSearch[];
  stays: StaySearch[];
  unavailableProviders: string[];
  retrievedAt: string;
};

const EMPTY: Omit<RetrievedEvidence, "retrievedAt"> = { places: [], placeGroups: [], sources: [], weather: null, weatherDays: [], routes: [], events: [], flights: [], stays: [], unavailableProviders: [] };

const SMALL_EVENT = /\b(open mic|trivia|quiz night|karaoke|jam session|networking|meet\s?up|pub quiz)\b/i;
/** "How big is this" for ordering a broad "what's on?" list. A provider-supplied `rank` (0–100)
 *  when present; otherwise a rough heuristic on the same-ish scale. */
function eventPopularity(e: EventResult): number {
  if (typeof e.rank === "number") return e.rank;
  return (e.imageUrl ? 20 : 0) + (e.source === "ticketmaster" ? 10 : 0) - (SMALL_EVENT.test(e.title) ? 30 : 0);
}

// Kept as a re-export — moved into retrieve/handlers/events.ts with the rest of the events
// logic (Phase 1.2.3), but this stays the public import path.
export { cleanEventKeyword } from "./retrieve/handlers/events";

/** RETRIEVE stage: run the resolver's tool plan in parallel, isolate provider failures, dedupe, apply dislike filter. */
export async function retrieveEvidence(
  toolPlan: ToolCall[],
  filters: RetrieveFilters = {},
  signal?: AbortSignal,
): Promise<RetrievedEvidence> {
  if (toolPlan.length === 0) return { ...EMPTY, retrievedAt: new Date().toISOString() };

  const unavailableProviders: string[] = [];
  const fail = (name: string) => (error: unknown) => {
    if (signal?.aborted) throw error;
    // Live-caught: a provider failure was only ever visible as its bare name in
    // `unavailableProviders` (and the "ungrounded" fallback message) — the actual HTTP status
    // or error text that caused it was silently dropped right here, with nothing logged. That
    // made a real, reproducible google-places failure indistinguishable from "no results exist"
    // until this line existed — the only way to tell a 403 (key/IP restriction) from a 429
    // (quota) from a genuine empty result was to add this and wait for the next occurrence.
    logger.warn({ provider: name, err: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, "retrieve: provider call failed");
    if (!unavailableProviders.includes(name)) unavailableProviders.push(name);
    return undefined;
  };

  // A turn asking about both events and directions for the same city (or a directions call
  // geocoding both endpoints, one of which is the same city again) would otherwise pay for the
  // identical lookup twice — memoized by the promise (not just the result) so two calls that
  // start before the first resolves still collapse into one request, not just one cache hit.
  // Backed by a day-long shared cache too, not just this turn's Map: coordinates for a place
  // name are effectively immutable, so a different turn/trip/user asking about the same place
  // shouldn't pay for a fresh geocode either. `.catch(fail(...))` stays OUTSIDE `cached()`
  // (same shape as the weather/stays/research_web caches below) so a shared rejection still
  // reports "google-places unavailable" to every caller currently awaiting it, and a failure is
  // never durably cached — only a successful (possibly "no match") lookup is. Not tied to this
  // call's signal — the cached load is shared across callers, so one caller's abort must not
  // cancel it out from under another who's still waiting on the same key.
  const geocodeCache = new Map<string, Promise<[number, number] | null>>();
  const geocode = (name: string): Promise<[number, number] | null> => {
    const key = name.trim().toLowerCase();
    const existing = geocodeCache.get(key);
    if (existing) return existing;
    // "geocode-bias" (not the bare "geocode:" prefix) is deliberate: app/api/trips/[tripId]/
    // geocode/route.ts and route-plan/route.ts both also cache under a "geocode:<name>" key for
    // the exact same place strings, but store a `{lat, lng}` OBJECT — this function stores a
    // `[lng, lat]` TUPLE. Sharing the prefix meant whichever wrote first "won" the key for 24h
    // (up to 96h with this cache's stale-serve extension), and the other side's `point[1]`/
    // `point[0]` silently read `undefined` off the wrong shape. Live-caught: the Browse map's
    // geocode lookup for "Montreal, Canada" poisoned this key, and every @Roam search_places call
    // for Montreal afterward crashed with "Cannot read properties of undefined (reading 'toFixed')"
    // deep inside GooglePlacesProvider.search — caught only as a bare "google-places unavailable"
    // until this cache write and the fix above.
    const promise = cached(`geocode-bias:${key}`, 24 * 60 * 60_000, () =>
      new GooglePlacesProvider().search(name).then((hits) => {
        const first = hits?.[0];
        return first ? ([first.longitude, first.latitude] as [number, number]) : null;
      }),
    ).catch(fail("google-places")).then((result) => result ?? null);
    geocodeCache.set(key, promise);
    return promise;
  };

  // Collapse the run of short walk legs a transit plan puts between rides;
  // keep transit legs (with the route name) and only meaningful walks.
  const formatTransitSteps = (steps: Array<{ mode: string; durationSeconds: number; line?: string; arrivalStop?: string }>): string[] => {
    const out: string[] = [];
    let walk = 0;
    const flushWalk = () => { if (walk >= 180) out.push(`Walk ${Math.round(walk / 60)} min`); walk = 0; };
    for (const step of steps) {
      const minutes = Math.max(1, Math.round(step.durationSeconds / 60));
      if (/walk/i.test(step.mode)) { walk += step.durationSeconds; continue; }
      flushWalk();
      const name = step.line ? `${step.mode.replace(/_/g, " ")} ${step.line}` : step.mode.replace(/_/g, " ");
      out.push(`${name}${step.arrivalStop ? ` → ${step.arrivalStop}` : ""} (${minutes} min)`);
    }
    flushWalk();
    return out.length ? out : ["Mostly on foot"];
  };

  const ctx: RetrieveContext = {
    filters,
    signal,
    fail,
    geocode,
    formatTransitSteps,
    places: [],
    rawPlaceGroups: [],
    sources: [],
    routes: [],
    eventList: [],
    eventsBroad: false, // set by the events handler when the query had nothing specific
    flights: [],
    stays: [],
    weather: { summary: null, days: [] },
  };
  // Local aliases into ctx's arrays (not copies — same references), so the dedup/rank/finalize
  // logic below reads exactly as it did before the handler split.
  const places = ctx.places;
  const sources = ctx.sources;
  const routes = ctx.routes;
  const eventList = ctx.eventList;
  const flights = ctx.flights;
  const stays = ctx.stays;

  await Promise.all(toolPlan.map((call, index) => HANDLERS[call.tool](call as never, ctx, index)));

  const excludeNames = new Set((filters.excludeNames ?? []).map((name) => name.trim().toLowerCase()));
  const filterAndRank = (input: Place[], limit: number) => {
    // Dislikes/accessibility: shared with the recommendation system, see preference-filter.ts.
    // Same order as before extraction — dislikes, then this trip's own exact-name exclusions
    // (not a "preference" the reco system has a concept of), then the accessibility hard filter.
    const liked = filterByPreferences(input, { dislikes: filters.dislikes });
    // Exact-name exclusion only: rejecting one cafe must not reject every cafe.
    const kept = excludeNames.size ? liked.filter((place) => !excludeNames.has(place.name.trim().toLowerCase())) : liked;
    const accessible = filterByPreferences(kept, { accessibilityNeeds: filters.accessibilityNeeds });
    // A text search for "nightlife"/"restaurant"/etc. can return a short-term rental whose
    // SEO-stuffed name matches the keyword (Google category "lodging") — a listing, not a venue
    // to go to. `packages/reco/shape-lanes.ts` already filters this out for Discover/"Around
    // here"; this is the same fix for chat's own search_places results (personal chat, group
    // chat, and any mid-COMPOSE follow-up search), which never got it — a real hotel/stays
    // search is unaffected, since those results come from the separate `stays` tool/ctx.stays,
    // never through here.
    const venuesOnly = accessible.filter((place) => classifyPlaceVibe({ primaryType: place.category, name: place.name }).vibe !== "lodging");
    const ranked = rankPlaces(venuesOnly, { interests: filters.interests, likes: filters.likes, dislikes: filters.dislikes }).map((r) => r.place);
    return Array.from(new Map(ranked.map((place) => [`${place.provider}:${place.name.trim().toLowerCase()}`, place])).values()).slice(0, limit);
  };
  const uniquePlaces = filterAndRank(places, 12);
  const usedAcrossGroups = new Set<string>();
  const placeGroups = ctx.rawPlaceGroups
    .sort((a, b) => a.index - b.index)
    .map((group) => ({
      label: group.label,
      places: filterAndRank(group.places, 12).filter((place) => {
        const key = `${place.provider}:${place.name.trim().toLowerCase()}`;
        if (usedAcrossGroups.has(key)) return false;
        usedAcrossGroups.add(key);
        return true;
      }),
    }))
    .filter((group) => group.places.length > 0);
  const uniqueSources = Array.from(new Map(sources.map((source) => [source.url, source])).values()).slice(0, 5);
  // De-dup by (title, day) — Ticketmaster and Eventbrite can both list the same real-world
  // event; keep whichever was seen first.
  const byKey = new Map<string, EventResult>();
  for (const event of eventList) {
    // A ticket "link" that isn't a real web link (javascript:/data:/relative) is useless and,
    // rendered as an <a href>, an XSS vector — drop it at the source.
    if (!/^https?:\/\//i.test(event.url ?? "")) continue;
    const key = `${event.title.trim().toLowerCase()}|${event.startDate ?? event.url}`;
    if (!byKey.has(key)) byKey.set(key, event);
  }
  // Order: in-window first, then near-misses by closeness. Within the in-window group, a broad
  // "what's on?" is ordered by pull (bigger events first), a specific ask by date.
  const relRank = { in: 0, before: 1, after: 2, undefined: 1 } as const;
  const uniqueEvents = Array.from(byKey.values())
    .sort((a, b) => {
      const byRel = relRank[a.relToTrip ?? "undefined"] - relRank[b.relToTrip ?? "undefined"];
      if (byRel) return byRel;
      if (a.relToTrip === "before" || a.relToTrip === "after") return (a.offsetDays ?? 0) - (b.offsetDays ?? 0);
      if (ctx.eventsBroad) {
        const byPull = eventPopularity(b) - eventPopularity(a);
        if (byPull) return byPull;
      }
      return (a.startDate ?? "").localeCompare(b.startDate ?? "");
    })
    .slice(0, 6);

  return { places: uniquePlaces, placeGroups, sources: uniqueSources, weather: ctx.weather.summary, weatherDays: ctx.weather.days, routes, events: uniqueEvents, flights, stays, unavailableProviders, retrievedAt: new Date().toISOString() };
}
