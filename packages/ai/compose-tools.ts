import { tool } from "ai";
import { z } from "zod";
import { retrieveEvidence, type RetrievedEvidence } from "@/lib/application/retrieve";
import type { ToolCall } from "@/lib/application/turn-resolver";
import type { TripContext } from "@/lib/application/trip-context";

type RetrieveFilters = Parameters<typeof retrieveEvidence>[1];

export type ComposeToolDeps = {
  /** Same filters the up-front RETRIEVE used (dislikes, currency, rejected names, trip dates). */
  filters: RetrieveFilters;
  /** Disambiguate a bare place name with the trip destination, as the route does up front. */
  qualify: (place: string) => string;
  tripStart?: string;
  tripEnd?: string;
  tripCtx: TripContext;
  signal?: AbortSignal;
  /** The route's prose-sanitiser allow-list — tools add the URLs they surface so a mid-loop
   *  research_web citation isn't stripped from the reply. */
  allowedUrls: Set<string>;
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * The COMPOSE tool set. Each provider tool runs one `retrieveEvidence` call (reusing all its
 * dedupe / rank / filter / provider-failure logic) and merges the result into `accumulated`,
 * which the route reads after the loop to build the card blocks. The model sees only a compact
 * summary — the cards are still assembled server-side from evidence (ADR 0002).
 *
 * The base plan from RESOLVE is still fetched up front; these tools only add follow-ups the
 * model asks for ("directions between the two places you just found").
 */
export function buildComposeTools(deps: ComposeToolDeps) {
  const accumulated: RetrievedEvidence & { usedTools: string[] } = {
    places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [],
    unavailableProviders: [], retrievedAt: new Date().toISOString(), usedTools: [],
  };
  const noteTool = (name: string) => { if (!accumulated.usedTools.includes(name)) accumulated.usedTools.push(name); };

  const merge = (ev: RetrievedEvidence) => {
    accumulated.places.push(...ev.places);
    accumulated.sources.push(...ev.sources);
    accumulated.routes.push(...ev.routes);
    accumulated.events.push(...ev.events);
    accumulated.flights.push(...ev.flights);
    accumulated.stays.push(...ev.stays);
    if (ev.weather) accumulated.weather = ev.weather;
    for (const p of ev.unavailableProviders) if (!accumulated.unavailableProviders.includes(p)) accumulated.unavailableProviders.push(p);
    for (const s of ev.sources) deps.allowedUrls.add(s.url);
    for (const e of ev.events) deps.allowedUrls.add(e.url);
    for (const p of ev.places) if (p.sourceUrl) deps.allowedUrls.add(p.sourceUrl);
  };

  const run = async (call: ToolCall): Promise<RetrievedEvidence> => {
    noteTool(call.tool);
    const ev = await retrieveEvidence([call], deps.filters, deps.signal);
    merge(ev);
    return ev;
  };

  const tools = {
    search_places: tool({
      description: "Find real places through Google Maps/Places (including rental shops, car/bike/equipment rentals, restaurants, bars, museums, sights, and clubs). Use for follow-ups the evidence below doesn't already cover.",
      inputSchema: z.object({ query: z.string().min(1).max(200), location: z.string().min(1).max(200) }),
      execute: async ({ query, location }) => {
        const ev = await run({ tool: "search_places", query, location: deps.qualify(location) });
        return ev.places.slice(0, 6).map((p) => ({ name: p.name, category: p.category, address: p.address, phone: p.phone, website: p.websiteUri, rating: p.rating }));
      },
    }),
    research_web: tool({
      description: "Current information, prices, articles, 'what is X known for', or a URL the user pasted.",
      inputSchema: z.object({ query: z.string().min(1).max(300) }),
      execute: async ({ query }) => {
        const ev = await run({ tool: "research_web", query });
        return ev.sources.map((s) => ({ title: s.title, url: s.url, excerpt: s.content.slice(0, 500) }));
      },
    }),
    weather: tool({
      description: "A live weather reading for a place (only useful for the next several days).",
      inputSchema: z.object({ location: z.string().min(1).max(200) }),
      execute: async ({ location }) => {
        const ev = await run({ tool: "weather", location });
        return ev.weather ?? "no live reading available";
      },
    }),
    events: tool({
      description: "Concerts, festivals, sports, shows in a city. Add a research_web call alongside for context.",
      inputSchema: z.object({ query: z.string().max(200).default(""), location: z.string().min(1).max(200) }),
      execute: async ({ query, location }) => {
        const ev = await run({ tool: "events", query, location });
        return ev.events.slice(0, 8).map((e) => ({ title: e.title, date: e.date, venue: e.venue, source: e.source }));
      },
    }),
    flights: tool({
      description: "Airfare estimates between two cities. Omit dates unless the user gave a real future one.",
      inputSchema: z.object({ origin: z.string().min(1).max(120), destination: z.string().min(1).max(120), departureDate: isoDate.optional() }),
      execute: async ({ origin, destination, departureDate }) => {
        const ev = await run({ tool: "flights", origin, destination, departureDate: departureDate ?? deps.tripStart });
        return ev.flights.flatMap((f) => f.offers.slice(0, 5).map((o) => ({ airline: o.airline, operatingAirline: o.operatingAirline, price: `${o.priceAmount} ${o.priceCurrency}`, airports: o.originAirport && o.destinationAirport ? `${o.originAirport} → ${o.destinationAirport}` : undefined, layovers: o.layoverAirports, cabin: o.cabinClass, baggage: o.baggage, aircraft: o.aircraft, fareConditions: o.fareConditions, stops: o.stops, hours: +(o.durationMinutes / 60).toFixed(1) })));
      },
    }),
    directions: tool({
      description: "How to travel between two named places (transit, walking, or driving).",
      inputSchema: z.object({ from: z.string().min(1).max(160), to: z.string().min(1).max(160), mode: z.enum(["transit", "walking", "driving"]).default("transit") }),
      execute: async ({ from, to, mode }) => {
        const ev = await run({ tool: "directions", from: deps.qualify(from), to: deps.qualify(to), mode });
        return ev.routes.map((r) => ({ from: r.from, to: r.to, mode: r.mode, minutes: Math.round(r.durationSeconds / 60), km: +(r.distanceMeters / 1000).toFixed(1), steps: r.steps.slice(0, 8) }));
      },
    }),
    stays: tool({
      description: "Hotel options and nightly rates in an area. Set hotelName only when the user asked about one specific hotel.",
      inputSchema: z.object({ location: z.string().min(1).max(200), checkin: isoDate.optional(), checkout: isoDate.optional(), hotelName: z.string().max(160).optional() }),
      execute: async ({ location, checkin, checkout, hotelName }) => {
        const ev = await run({ tool: "stays", location: deps.qualify(location), checkin: checkin ?? deps.tripStart, checkout: checkout ?? deps.tripEnd, hotelName });
        return ev.stays.flatMap((s) => s.options.slice(0, 6).map((o) => ({ name: o.name, nightly: `${o.nightlyAmount} ${o.currency}`, stars: o.stars, rating: o.rating })));
      },
    }),
    get_itinerary: tool({
      description: "The trip's current itinerary items, with day number and whether each is locked.",
      inputSchema: z.object({}),
      execute: async () => {
        noteTool("get_itinerary");
        return deps.tripCtx.itinerary.map((i) => ({ title: i.title, day: i.day_index, locked: i.locked }));
      },
    }),
    get_saved_places: tool({
      description: "Places the traveller has already saved or rejected on this trip.",
      inputSchema: z.object({}),
      execute: async () => {
        noteTool("get_saved_places");
        return deps.tripCtx.places.map((p) => ({ name: p.place?.name ?? null, status: p.status }));
      },
    }),
  };

  return { tools, accumulated };
}
