import type { Place } from "@/packages/contracts/place";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { research } from "@/packages/providers/tavily/client";
import { weather } from "@/packages/providers/openweather/client";
import { events } from "@/packages/providers/ticketmaster/client";
import { localEvents } from "@/packages/providers/eventbrite/client";
import { activities } from "@/packages/providers/getyourguide/client";
import { transit } from "@/packages/providers/google-places/transit";
import { route as mapboxRoute } from "@/packages/providers/mapbox/client";
import { transitAppPlan } from "@/packages/providers/transit-app/client";
import { searchFlights, type FlightOffer } from "@/packages/providers/duffel/client";
import { liteApiConfigured, searchStays } from "@/packages/providers/liteapi/client";
import type { StayOption, StayRoom } from "@/packages/contracts/stay";
import { resolveStayDates } from "./stay-dates";
import { rankPlaces } from "./rank-places";
import type { ToolCall } from "./turn-resolver";

export type EventResult = { title: string; url: string; date?: string; venue?: string; source: string };
export type FlightSearch = { origin: string; destination: string; departureDate: string; assumedDate: boolean; offers: FlightOffer[] };
export type StaySearch = {
  location: string;
  checkin: string;
  checkout: string;
  nights: number;
  assumedDates: boolean;
  options: StayOption[];
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
};

export type RetrievedEvidence = {
  places: Place[];
  sources: Array<{ title: string; url: string; content: string }>;
  weather: string | null;
  routes: RouteResult[];
  events: EventResult[];
  flights: FlightSearch[];
  stays: StaySearch[];
  unavailableProviders: string[];
  retrievedAt: string;
};

const EMPTY: Omit<RetrievedEvidence, "retrievedAt"> = { places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [] };

const stem = (word: string) => word.replace(/(ies|es|s)$/, (match) => (match === "ies" ? "y" : ""));

// Ticketmaster/Eventbrite keyword search matches all words — a raw question
// ("are there any punjabi concerts between my dates in Montreal") matches nothing.
// Keep only the meaningful terms (artist / genre / type).
const EVENT_STOPWORDS = new Set([
  "a", "an", "the", "any", "are", "is", "there", "any", "some", "in", "on", "at", "near", "around", "to", "of", "for",
  "concert", "concerts", "show", "shows", "gig", "gigs", "event", "events", "ticket", "tickets", "performance",
  "between", "during", "this", "that", "my", "our", "we", "i", "planning", "plan", "go", "going", "visit", "trip",
  "date", "dates", "day", "days", "weekend", "week", "happening", "on", "while", "when", "and", "or",
]);
export function cleanEventKeyword(query: string, location: string): string {
  const locWords = new Set(location.toLowerCase().split(/[^a-z]+/).filter(Boolean));
  const kept = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !EVENT_STOPWORDS.has(w) && !locWords.has(w));
  return kept.join(" ").slice(0, 60);
}

/** RETRIEVE stage: run the resolver's tool plan in parallel, isolate provider failures, dedupe, apply dislike filter. */
export async function retrieveEvidence(
  toolPlan: ToolCall[],
  filters: { dislikes?: string[]; currency?: string; interests?: string[]; likes?: string[]; tripStart?: string | null; tripEnd?: string | null } = {},
  signal?: AbortSignal,
): Promise<RetrievedEvidence> {
  if (toolPlan.length === 0) return { ...EMPTY, retrievedAt: new Date().toISOString() };

  const unavailableProviders: string[] = [];
  const fail = (name: string) => (error: unknown) => {
    if (signal?.aborted) throw error;
    if (!unavailableProviders.includes(name)) unavailableProviders.push(name);
    return undefined;
  };

  const places: Place[] = [];
  const sources: Array<{ title: string; url: string; content: string }> = [];
  const routes: RouteResult[] = [];
  const eventList: EventResult[] = [];
  const flights: FlightSearch[] = [];
  const stays: StaySearch[] = [];
  let weatherSummary: string | null = null;

  const geocode = async (name: string): Promise<[number, number] | null> => {
    const hits = await new GooglePlacesProvider().search(name, signal).catch(fail("google-places"));
    const first = hits?.[0];
    return first ? [first.longitude, first.latitude] : null;
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

  await Promise.all(
    toolPlan.map(async (call) => {
      if (call.tool === "search_places") {
        const results = await new GooglePlacesProvider().search(`${call.query} in ${call.location}`, signal).catch(fail("google-places"));
        if (results) places.push(...results);
      } else if (call.tool === "research_web") {
        const results = await research(call.query, signal).catch(fail("tavily"));
        if (results) sources.push(...results.map(({ title, url, content }) => ({ title, url, content })));
      } else if (call.tool === "events") {
        const wantTicketmaster = Boolean(process.env.TICKETMASTER_CONSUMER_KEY || process.env.TICKETMASTER_API_KEY);
        const wantEventbrite = Boolean(process.env.EVENTBRITE_API_KEY);
        const wantGyg = Boolean(process.env.GETYOURGUIDE_API_KEY);
        const keyword = cleanEventKeyword(call.query, call.location);
        const dateWindow = { start: filters.tripStart ?? undefined, end: filters.tripEnd ?? undefined };
        const point = wantEventbrite ? await geocode(call.location) : null;
        const [tm, eb, gyg] = await Promise.all([
          wantTicketmaster ? events(keyword, call.location, dateWindow, signal).catch(fail("ticketmaster")) : Promise.resolve(undefined),
          wantEventbrite && point ? localEvents(keyword, point[1], point[0], signal).catch(fail("eventbrite")) : Promise.resolve(undefined),
          wantGyg ? activities(`${keyword} ${call.location}`.trim(), filters.currency ?? "USD", signal).catch(fail("getyourguide")) : Promise.resolve(undefined),
        ]);
        const tmEvents = (tm ?? []).map((event) => ({ title: event.title, url: event.url, date: event.date, venue: event.venue, source: "ticketmaster" }));
        const ebEvents = (eb ?? []).map((event) => ({ title: event.title, url: event.url, date: event.date, venue: event.venue, source: "eventbrite" }));
        const gygEvents = (gyg ?? []).map((a) => ({ title: a.title, url: a.url, date: a.date, venue: a.venue, source: "getyourguide" }));
        // Interleave so a later slice keeps a mix of all providers.
        for (let i = 0; i < Math.max(tmEvents.length, ebEvents.length, gygEvents.length); i += 1) {
          if (tmEvents[i]) eventList.push(tmEvents[i]);
          if (ebEvents[i]) eventList.push(ebEvents[i]);
          if (gygEvents[i]) eventList.push(gygEvents[i]);
        }
      } else if (call.tool === "flights") {
        if (!process.env.DUFFEL_API_KEY) return;
        // The model routinely emits a stale year; never trust it. Anything not clearly
        // in the future becomes an example date ~6 weeks out.
        const today = new Date().toISOString().slice(0, 10);
        const assumedDate = !call.departureDate || call.departureDate <= today;
        const departureDate = assumedDate ? new Date(Date.now() + 42 * 864e5).toISOString().slice(0, 10) : call.departureDate!;
        const returnDate = call.returnDate && call.returnDate > departureDate ? call.returnDate : undefined;
        const offers = await searchFlights({ origin: call.origin, destination: call.destination, departureDate, returnDate }, signal).catch(fail("duffel"));
        if (offers && offers.length) flights.push({ origin: call.origin, destination: call.destination, departureDate, assumedDate, offers: offers.slice(0, 6) });
      } else if (call.tool === "stays") {
        if (!liteApiConfigured()) return;
        const { checkin, checkout, assumed: assumedDates } = resolveStayDates(call.checkin, call.checkout);
        const point = await geocode(call.location);
        const result = await searchStays(
          point
            ? { latitude: point[1], longitude: point[0], checkin, checkout, currency: filters.currency }
            : { city: call.location, checkin, checkout, currency: filters.currency },
          signal,
        ).catch(fail("liteapi"));
        if (!result || result.options.length === 0) return;
        // Room rates were already in the search response — no second provider call.
        let detail: StaySearch["detail"];
        if (call.hotelName) {
          const wanted = call.hotelName.toLowerCase();
          const match = result.options.find((option) => option.name.toLowerCase().includes(wanted) || wanted.includes(option.name.toLowerCase()));
          if (match && match.rooms.length) detail = { hotelName: match.name, rooms: match.rooms };
        }
        stays.push({ location: call.location, checkin, checkout, nights: result.nights, assumedDates, options: result.options, detail });
      } else if (call.tool === "weather") {
        const near = await new GooglePlacesProvider().search(call.location, signal).catch(fail("google-places"));
        const anchor = near?.[0];
        if (anchor) {
          const forecast = await weather({ latitude: anchor.latitude, longitude: anchor.longitude, name: anchor.name }, signal).catch(fail("openweather"));
          if (forecast) weatherSummary = forecast.summary;
        }
      } else if (call.tool === "directions") {
        let got = false;
        if (call.mode === "transit") {
          const legs = await transit({ origin: call.from, destination: call.to }, signal).catch(fail("google-routes"));
          const leg = legs?.[0];
          if (leg && leg.durationSeconds > 0) {
            got = true;
            routes.push({
              from: call.from, to: call.to, mode: "transit",
              distanceMeters: leg.distanceMeters, durationSeconds: leg.durationSeconds,
              departureTime: leg.departureTime, arrivalTime: leg.arrivalTime,
              steps: formatTransitSteps(leg.steps),
            });
          }
          if (!got) {
            // Second local-transit provider (better real-time in its ~300 covered cities).
            const [from, to] = await Promise.all([geocode(call.from), geocode(call.to)]);
            const plan = from && to ? await transitAppPlan(from, to, signal).catch(fail("transit-app")) : null;
            if (plan) {
              got = true;
              routes.push({
                from: call.from, to: call.to, mode: "transit",
                distanceMeters: plan.distanceMeters, durationSeconds: plan.durationSeconds,
                departureTime: plan.departureTime, arrivalTime: plan.arrivalTime,
                steps: formatTransitSteps(plan.steps),
              });
            }
          }
        } else {
          const [from, to] = await Promise.all([geocode(call.from), geocode(call.to)]);
          if (from && to) {
            const drawn = await mapboxRoute({ origin: from, destination: to, profile: call.mode === "walking" ? "walking" : "driving" }, signal).catch(fail("mapbox"));
            if (drawn) { got = true; routes.push({ from: call.from, to: call.to, mode: call.mode, distanceMeters: drawn.distanceMeters, durationSeconds: drawn.durationSeconds, steps: [] }); }
          }
        }
        // Routes API doesn't do intercity rail/coach well (e.g. Tokyo→Kyoto Shinkansen).
        // Fall back to web research so the answer isn't a dead end.
        if (!got) {
          const web = await research(`best way to travel from ${call.from} to ${call.to} time cost`, signal).catch(fail("tavily"));
          if (web) sources.push(...web.map(({ title, url, content }) => ({ title, url, content })));
        }
      }
    }),
  );

  const dislikeStems = (filters.dislikes ?? [])
    .flatMap((phrase) => phrase.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 2))
    .map(stem);
  const kept = dislikeStems.length
    ? places.filter((place) => {
      const words = new Set(`${place.name} ${place.category ?? ""}`.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem));
      return !dislikeStems.some((term) => words.has(term));
    })
    : places;
  // Order by the same ranker Discover uses so the assistant's cards and the
  // Discover feed stay coherent. No proximity anchor here — Discover has one.
  const ranked = rankPlaces(kept, { interests: filters.interests, likes: filters.likes, dislikes: filters.dislikes }).map((r) => r.place);
  const uniquePlaces = Array.from(new Map(ranked.map((place) => [`${place.provider}:${place.name.trim().toLowerCase()}`, place])).values()).slice(0, 6);
  const uniqueSources = Array.from(new Map(sources.map((source) => [source.url, source])).values()).slice(0, 5);
  const uniqueEvents = Array.from(new Map(eventList.map((event) => [event.url, event])).values()).slice(0, 8);

  return { places: uniquePlaces, sources: uniqueSources, weather: weatherSummary, routes, events: uniqueEvents, flights, stays, unavailableProviders, retrievedAt: new Date().toISOString() };
}
