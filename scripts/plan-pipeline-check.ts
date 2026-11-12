/**
 * Live check of the whole "plan my first N days" path with real providers and models, minus the database: RESOLVE, the trip
 * brief, the kind-by-kind searches (Google Places, Ticketmaster), the balanced merge and the itinerary builder. Prints what
 * each stage produced and the final plan, so a short plan, a one-note plan or a missing day shows up at once.
 * Spends a few cents and writes nothing. .env.local is a production env: blank the cache variables, as the usage line does.
 *
 *   REDIS_URL= REDIS_KV_URL= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= REDIS_KV_REST_API_URL= REDIS_KV_REST_API_TOKEN= \
 *     bun run scripts/plan-pipeline-check.ts ["Plan my first 5 days"]
 */
import { buildItineraryPlan } from "../lib/application/itinerary-plan";
import { compactEvidence } from "../lib/application/orchestrate/evidence-compaction";
import { planRetrieval, retrieveFiltersFor } from "../lib/application/orchestrate/retrieve-plan";
import { retrieveEvidence } from "../lib/application/retrieve";
import { buildTripBrief } from "../lib/application/trip-brief";
import { resolveTurn } from "../lib/application/turn-resolver";
import { needsRoute, planRoute } from "../lib/application/trip-route";

const message = process.argv[2] ?? "Plan my first 5 days";
const trip = { name: "Toronto long weekend", destination: "Toronto, Ontario, Canada", origin: null, duration_days: 4, start_date: "2026-12-18", end_date: "2026-12-21", travelers: 4 };
const preferences = { likes: ["Indian food", "hiking"], groupType: "friends", pace: "moderate" };
const tripSummary = `trip: ${trip.name}; destination: ${trip.destination}; duration: 4 days; travellers: 4; dates: ${trip.start_date} to ${trip.end_date}; likes: Indian food, hiking; group: friends`;
const history = [
  { role: "user" as const, content: "one day trip with friends, its a long weekend in toronto and places around it" },
  { role: "assistant" as const, content: "Fun. A long weekend in Toronto gives you city and day-trip options. What are you into?" },
  { role: "user" as const, content: "famous indian restaurants" },
  { role: "assistant" as const, content: "Here are some well-known Indian restaurants around Toronto." },
];
const tripCtx = { trip, places: [], itinerary: [], preferences } as never;
const lap = (t0: number) => `${((performance.now() - t0) / 1000).toFixed(1)}s`;

let t = performance.now();
const resolved = await resolveTurn({ message, history, tripSummary });
console.log(`RESOLVE ${lap(t)}: capabilities=${resolved.capabilities.join(",")} itineraryDays=${resolved.itineraryDays} intent=${resolved.intent} searches=${resolved.toolPlan.map((c) => (c.tool === "search_places" ? `places(${c.query})` : c.tool)).join(" | ")}`);
const locationFocus = resolved.locationFocus ?? trip.destination;

t = performance.now();
const days = resolved.itineraryDays ?? trip.duration_days;
const route = needsRoute({ resolved, locationFocus, days }) ? await planRoute({ focus: locationFocus, days, startDate: trip.start_date, request: message }) : null;
if (route) console.log(`ROUTE ${lap(t)}: ${route.map((leg) => `${leg.city} ${leg.days}d`).join(" → ")}`);
const legBriefs = route ? await Promise.all(route.map((leg) => buildTripBrief({ destination: leg.city, startDate: trip.start_date, preferences }))) : [];
const brief = route ? null : await buildTripBrief({ destination: locationFocus, startDate: trip.start_date, preferences });
console.log(`BRIEF (menu written, cold) ${lap(t)}: ${brief ? brief.kinds.map((k) => `${k.label}${k.scale === "day_trip" ? "*" : ""}`).join(", ") : route ? `per city (${legBriefs.filter(Boolean).length}/${route.length})` : "none (fixed lanes)"}`);
t = performance.now();
await buildTripBrief({ destination: locationFocus, startDate: trip.start_date, preferences });
console.log(`BRIEF (same menu, warm) ${lap(t)}`);

const caps = new Set(resolved.capabilities);
const { toolPlan, placeLimit, qualify } = planRetrieval({ resolved, prompt: message, tripCtx, locationFocus, caps, now: new Date(), brief, route, legBriefs });
console.log(`PLAN: ${toolPlan.length} searches, keep ${placeLimit}: ${toolPlan.map((c) => (c.tool === "search_places" ? `places(${c.query})` : c.tool === "events" ? `events(${c.category ?? "what's on"})` : c.tool)).join(" | ")}`);

t = performance.now();
const filters = { ...retrieveFiltersFor(tripCtx, []), placeLimit };
const evidence = await retrieveEvidence(toolPlan, filters);
const perKind = new Map<string, number>();
for (const group of evidence.placeGroups ?? []) perKind.set(group.label, group.places.length);
console.log(`RETRIEVE ${lap(t)}: ${evidence.places.length} places, ${evidence.events.length} events, unavailable=[${evidence.unavailableProviders}]`);
console.log(`  per search: ${[...perKind].map(([k, n]) => `${k}=${n}`).join("; ")}`);
console.log(`  events: ${evidence.events.map((e) => `${e.title} (${e.startDate ?? e.date}, ${e.relToTrip ?? "?"})`).join("; ") || "none"}`);

const { anchorEvent } = compactEvidence({ evidence, toolPlan, requestedImages: false, photoUrl: (n) => n });
t = performance.now();
const block = await buildItineraryPlan({ prompt: message, tripSummary, evidence, tripCtx, anchorEvent, brief, route, legBriefs, requestedDays: resolved.itineraryDays });
console.log(`ITINERARY ${lap(t)}:`);
if (!block || block.type !== "itinerary") console.log("  (no plan)");
else {
  console.log(`  ${block.title ?? ""} — ${block.intro ?? ""}`);
  for (const day of block.days) console.log(`  ${day.label}${day.subtitle ? ` · ${day.subtitle}` : ""}${(day as { open?: boolean }).open ? " [open]" : ""}\n${day.stops.map((s) => `      ${s.time ?? "--:--"} ${s.kind ?? ""} ${s.title}`).join("\n")}`);
}
process.exit(0);
