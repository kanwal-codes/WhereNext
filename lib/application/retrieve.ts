import type { Place } from "@/packages/contracts/place";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { research } from "@/packages/providers/tavily/client";
import { weather, type WeatherDay } from "@/packages/providers/openweather/client";
import { events } from "@/packages/providers/ticketmaster/client";
import { localEvents } from "@/packages/providers/eventbrite/client";
import { activities } from "@/packages/providers/getyourguide/client";
import { predictHqEvents } from "@/packages/providers/predicthq/client";
import { transit } from "@/packages/providers/google-places/transit";
import { route as mapboxRoute } from "@/packages/providers/mapbox/client";
import { transitAppPlan } from "@/packages/providers/transit-app/client";
import { searchFlights, type FlightOffer } from "@/packages/providers/duffel/client";
import { liteApiConfigured, searchStays } from "@/packages/providers/liteapi/client";
import type { StayOption, StayRoom } from "@/packages/contracts/stay";
import { cached } from "@/lib/server/ttl-cache";
import { resolveStayDates } from "./stay-dates";
import { rankPlaces } from "./rank-places";
import type { ToolCall } from "./turn-resolver";

export type EventResult = {
  title: string;
  url: string;
  date?: string;
  venue?: string;
  source: string;
  imageUrl?: string;
  /** PredictHQ local_rank (0–100, how big the event is for the area) + predicted attendance. */
  rank?: number;
  attendance?: number;
  /** ISO YYYY-MM-DD, when the provider gave a parseable date. */
  startDate?: string;
  /** Where the date falls relative to the trip window (only set when the turn is date-scoped). */
  relToTrip?: "in" | "before" | "after";
  /** Days from the trip edge — 0 for "in", N for "before" (arrive − date) / "after" (date − depart). */
  offsetDays?: number;
};
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

const stem = (word: string) => word.replace(/(ies|es|s)$/, (match) => (match === "ies" ? "y" : ""));

/** First 10 chars of a date string, when they're a valid ISO day. */
function isoDay(value?: string): string | undefined {
  const day = (value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) ? day : undefined;
}
/** `iso` shifted by `days` (may be negative), as an ISO day. */
function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Whole days from `fromIso` to `toIso` (assumes `toIso >= fromIso`). */
function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

const SMALL_EVENT = /\b(open mic|trivia|quiz night|karaoke|jam session|networking|meet\s?up|pub quiz)\b/i;
/** "How big is this" for ordering a broad "what's on?" list. PredictHQ's rank (0–100) when we
 *  have it; otherwise a rough heuristic on the same-ish scale. */
function eventPopularity(e: EventResult): number {
  if (typeof e.rank === "number") return e.rank;
  return (e.imageUrl ? 20 : 0) + (e.source === "ticketmaster" ? 10 : 0) - (SMALL_EVENT.test(e.title) ? 30 : 0);
}

// Ticketmaster/Eventbrite keyword search matches all words — a raw question
// ("are there any punjabi concerts between my dates in Montreal") matches nothing.
// Keep only the meaningful terms (artist / genre / type).
const EVENT_STOPWORDS = new Set([
  "a", "an", "the", "any", "are", "is", "there", "any", "some", "in", "on", "at", "near", "around", "to", "of", "for",
  "concert", "concerts", "show", "shows", "gig", "gigs", "event", "events", "ticket", "tickets", "performance",
  "between", "during", "this", "that", "my", "our", "we", "i", "planning", "plan", "go", "going", "visit", "trip",
  "date", "dates", "day", "days", "weekend", "week", "happening", "on", "while", "when", "and", "or",
  "anything", "something", "everything", "stuff", "things", "thing", "here", "out", "up", "get",
]);
export function cleanEventKeyword(query: string, location: string): string {
  const locWords = new Set(location.toLowerCase().split(/[^a-z]+/).filter(Boolean));
  const kept = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !EVENT_STOPWORDS.has(w) && !locWords.has(w));
  return kept.join(" ").slice(0, 60);
}

/** RETRIEVE stage: run the resolver's tool plan in parallel, isolate provider failures, dedupe, apply dislike filter. */
export async function retrieveEvidence(
  toolPlan: ToolCall[],
  filters: {
    dislikes?: string[];
    currency?: string;
    interests?: string[];
    likes?: string[];
    tripStart?: string | null;
    tripEnd?: string | null;
    /** Exact place names to drop from results — the trip's rejected places. */
    excludeNames?: string[];
    /** Trip party size — hotel rates should reflect who's actually going, not a 2-adult default. */
    travelers?: number | null;
  } = {},
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
  const rawPlaceGroups: Array<{ index: number; label: string; places: Place[] }> = [];
  const sources: Array<{ title: string; url: string; content: string }> = [];
  const routes: RouteResult[] = [];
  const eventList: EventResult[] = [];
  let eventsBroad = false; // set by the events branch when the query had nothing specific
  const flights: FlightSearch[] = [];
  const stays: StaySearch[] = [];
  let weatherSummary: string | null = null;
  let weatherDays: WeatherDay[] = [];

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
    toolPlan.map(async (call, index) => {
      if (call.tool === "search_places") {
        const results = await new GooglePlacesProvider().search(`${call.query} in ${call.location}`, signal).catch(fail("google-places"));
        if (results) {
          const provider = new GooglePlacesProvider();
          const enriched = await Promise.all(results.slice(0, 6).map(async (place) => {
            try {
              const detail = await provider.details(place.providerId, signal) as { nationalPhoneNumber?: string; websiteUri?: string; regularOpeningHours?: { weekdayDescriptions?: string[]; openNow?: boolean }; accessibilityOptions?: { wheelchairAccessibleEntrance?: boolean }; editorialSummary?: { text?: string } };
              return { ...place, phone: detail.nationalPhoneNumber, websiteUri: detail.websiteUri, openingHours: detail.regularOpeningHours?.weekdayDescriptions, openNow: detail.regularOpeningHours?.openNow, wheelchairAccessible: detail.accessibilityOptions?.wheelchairAccessibleEntrance, reviewSummary: detail.editorialSummary?.text };
            } catch (error) {
              if (signal?.aborted) throw error;
              return place;
            }
          }));
          places.push(...enriched, ...results.slice(6));
          rawPlaceGroups.push({ index, label: call.query, places: enriched });
        }
      } else if (call.tool === "research_web") {
        const results = await research(call.query, signal).catch(fail("tavily"));
        if (results) sources.push(...results.map(({ title, url, content }) => ({ title, url, content })));
      } else if (call.tool === "events") {
        const wantTicketmaster = Boolean(process.env.TICKETMASTER_CONSUMER_KEY || process.env.TICKETMASTER_API_KEY);
        const wantEventbrite = Boolean(process.env.EVENTBRITE_API_KEY);
        const wantGyg = Boolean(process.env.GETYOURGUIDE_API_KEY);
        const wantPhq = Boolean(process.env.PREDICTHQ_API_KEY);
        // Most specific term wins: a named act, else the kind of event, else the cleaned message.
        const keyword = call.artist || call.category || cleanEventKeyword(call.query, call.location);
        const broad = !keyword; // "what's on?" with nothing specific -> order by pull, not by date
        if (broad) eventsBroad = true;

        // Query a BUFFER either side of the trip so we can also talk about near-misses
        // ("X plays 5 days after you leave"). Wider for a named act — a miss-by-a-week still matters.
        const bufferDays = call.artist ? 30 : 14;
        const scoped = call.dateScoped !== false && Boolean(filters.tripStart && filters.tripEnd);
        const bufStart = scoped ? shiftIsoDate(filters.tripStart!, -bufferDays) : undefined;
        const bufEnd = scoped ? shiftIsoDate(filters.tripEnd!, bufferDays) : undefined;

        const point = wantEventbrite || wantPhq ? await geocode(call.location) : null;
        const [tm, eb, gyg, phq] = await Promise.all([
          wantTicketmaster ? events(keyword, call.location, { start: bufStart, end: bufEnd }, signal, broad ? "relevance" : "date").catch(fail("ticketmaster")) : Promise.resolve(undefined),
          wantEventbrite && point ? localEvents(keyword, point[1], point[0], signal).catch(fail("eventbrite")) : Promise.resolve(undefined),
          // GetYourGuide tours are undated experiences, not events-on-a-date — only useful when the
          // ask isn't tied to the trip window (otherwise they're dropped below anyway).
          wantGyg && !scoped ? activities(`${keyword} ${call.location}`.trim(), filters.currency ?? "USD", signal).catch(fail("getyourguide")) : Promise.resolve(undefined),
          wantPhq && point ? predictHqEvents(keyword, point, { start: bufStart, end: bufEnd }, signal, broad).catch(fail("predicthq")) : Promise.resolve(undefined),
        ]);

        const raw: EventResult[] = [
          ...(tm ?? []).map((e) => ({ title: e.title, url: e.url, date: e.date, venue: e.venue, source: "ticketmaster", imageUrl: e.imageUrl, startDate: isoDay(e.date) })),
          ...(eb ?? []).map((e) => ({ title: e.title, url: e.url, date: e.date, venue: e.venue, source: "eventbrite", startDate: isoDay(e.date) })),
          ...(gyg ?? []).map((a) => ({ title: a.title, url: a.url, date: a.date, venue: a.venue, source: "getyourguide", startDate: isoDay(a.date) })),
          ...(phq ?? []).map((e) => ({ title: e.title, url: e.url, date: e.date, venue: e.venue, source: "predicthq", rank: e.rank, attendance: e.attendance, startDate: e.startDate ?? isoDay(e.date) })),
        ];

        const artistWords = call.artist ? call.artist.toLowerCase().split(/\s+/).filter((w) => w.length > 2) : [];
        for (const event of raw) {
          // A named-act query only ever shows that act.
          if (artistWords.length) {
            const title = event.title.toLowerCase();
            if (!artistWords.every((w) => title.includes(w))) continue;
          }
          if (scoped) {
            // Can't place it, or it's outside the buffer -> not relevant to this trip.
            if (!event.startDate || event.startDate < bufStart! || event.startDate > bufEnd!) continue;
            if (event.startDate >= filters.tripStart! && event.startDate <= filters.tripEnd!) {
              event.relToTrip = "in";
              event.offsetDays = 0;
            } else if (event.startDate < filters.tripStart!) {
              event.relToTrip = "before";
              event.offsetDays = daysBetweenIso(event.startDate, filters.tripStart!);
            } else {
              event.relToTrip = "after";
              event.offsetDays = daysBetweenIso(filters.tripEnd!, event.startDate);
            }
          }
          eventList.push(event);
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
        const adults = filters.travelers ?? undefined;
        // Same 5-minute, party/date-aware cache the Stays tab route uses — a chat ask for a hotel
        // right after (or before) browsing the tab shouldn't re-hit the provider for the same search.
        const cacheKey = `stays-tab:${call.location}:${checkin}:${checkout}:${adults ?? ""}:1:${filters.currency ?? ""}:{}`;
        const result = await cached(cacheKey, 5 * 60_000, async () => {
          const point = await geocode(call.location);
          return searchStays(
            point
              ? { latitude: point[1], longitude: point[0], checkin, checkout, currency: filters.currency, adults }
              : { city: call.location, checkin, checkout, currency: filters.currency, adults },
            signal,
          );
        }).catch(fail("liteapi"));
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
        const forecast = await weather(call.location, signal).catch(fail("openweather"));
        if (forecast) { weatherSummary = forecast.summary; weatherDays = forecast.days; }
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
              fare: leg.fare,
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
  const excludeNames = new Set((filters.excludeNames ?? []).map((name) => name.trim().toLowerCase()));
  const filterAndRank = (input: Place[], limit: number) => {
    const liked = dislikeStems.length
      ? input.filter((place) => {
      const words = new Set(`${place.name} ${place.category ?? ""}`.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem));
      return !dislikeStems.some((term) => words.has(term));
    })
      : input;
    // Exact-name exclusion only: rejecting one cafe must not reject every cafe.
    const kept = excludeNames.size ? liked.filter((place) => !excludeNames.has(place.name.trim().toLowerCase())) : liked;
    const ranked = rankPlaces(kept, { interests: filters.interests, likes: filters.likes, dislikes: filters.dislikes }).map((r) => r.place);
    return Array.from(new Map(ranked.map((place) => [`${place.provider}:${place.name.trim().toLowerCase()}`, place])).values()).slice(0, limit);
  };
  const uniquePlaces = filterAndRank(places, 12);
  const usedAcrossGroups = new Set<string>();
  const placeGroups = rawPlaceGroups
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
  // De-dup by (title, day). When a PredictHQ row (no ticket link) collides with a Ticketmaster/
  // Eventbrite one, keep the ticketed copy but carry PredictHQ's rank + attendance onto it.
  const byKey = new Map<string, EventResult>();
  for (const event of eventList) {
    // A ticket "link" that isn't a real web link (javascript:/data:/relative) is useless and,
    // rendered as an <a href>, an XSS vector — drop it at the source.
    if (!/^https?:\/\//i.test(event.url ?? "")) continue;
    const key = `${event.title.trim().toLowerCase()}|${event.startDate ?? event.url}`;
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, event); continue; }
    const keep = existing.source === "predicthq" && event.source !== "predicthq" ? event : existing;
    const drop = keep === existing ? event : existing;
    keep.rank ??= drop.rank;
    keep.attendance ??= drop.attendance;
    byKey.set(key, keep);
  }
  // Order: in-window first, then near-misses by closeness. Within the in-window group, a broad
  // "what's on?" is ordered by pull (bigger events first), a specific ask by date.
  const relRank = { in: 0, before: 1, after: 2, undefined: 1 } as const;
  const uniqueEvents = Array.from(byKey.values())
    .sort((a, b) => {
      const byRel = relRank[a.relToTrip ?? "undefined"] - relRank[b.relToTrip ?? "undefined"];
      if (byRel) return byRel;
      if (a.relToTrip === "before" || a.relToTrip === "after") return (a.offsetDays ?? 0) - (b.offsetDays ?? 0);
      if (eventsBroad) {
        const byPull = eventPopularity(b) - eventPopularity(a);
        if (byPull) return byPull;
      }
      return (a.startDate ?? "").localeCompare(b.startDate ?? "");
    })
    .slice(0, 6);

  return { places: uniquePlaces, placeGroups, sources: uniqueSources, weather: weatherSummary, weatherDays, routes, events: uniqueEvents, flights, stays, unavailableProviders, retrievedAt: new Date().toISOString() };
}
