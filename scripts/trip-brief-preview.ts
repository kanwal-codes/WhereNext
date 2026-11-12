/**
 * Prints the trip brief (the kinds of place and event a plan will search for) and the searches it turns into, for a few
 * sample trips, so the quality of the reasoning can be judged by eye. Makes real model calls (a few cents) and, for an
 * unfamiliar place, a web lookup. .env.local is a production env: start it with the cache blanked, or the brief is cached in
 * the production Redis and the open connection keeps the process from exiting.
 *
 *   REDIS_URL= REDIS_KV_URL= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= REDIS_KV_REST_API_URL= REDIS_KV_REST_API_TOKEN= \
 *     bun run scripts/trip-brief-preview.ts
 *
 *   bun run scripts/trip-brief-preview.ts            # the built-in cases
 *   bun run scripts/trip-brief-preview.ts "Lisbon, Portugal" 2026-07-10 5
 */
import { buildTripBrief } from "../lib/application/trip-brief";
import { planBreadth } from "../lib/application/route-calls";

type Case = { destination: string; startDate: string; days: number; tripSummary: string; preferences: Record<string, unknown> };

const CASES: Case[] = [
  { destination: "Toronto, Ontario, Canada", startDate: "2026-10-09", days: 5, tripSummary: "friends on a long weekend", preferences: { likes: ["Indian food", "hiking"], groupType: "friends" } },
  { destination: "Tulum, Mexico", startDate: "2026-02-14", days: 5, tripSummary: "a couple wanting to relax", preferences: { likes: ["beach", "wellness"], dislikes: ["nightclubs"], pace: "relaxed", groupType: "couple" } },
  { destination: "Queenstown, New Zealand", startDate: "2027-01-10", days: 4, tripSummary: "four friends who want adrenaline", preferences: { interests: ["skydiving", "bungee", "mountains"], groupType: "friends" } },
];

const [destination, startDate, days] = process.argv.slice(2);
const cases = destination ? [{ destination, startDate: startDate ?? "", days: Number(days) || 4, tripSummary: "a traveller", preferences: {} }] : CASES;

for (const trip of cases) {
  console.log(`\n=== ${trip.destination} · ${trip.startDate || "no dates"} · ${trip.days} days · ${trip.tripSummary}`);
  const t0 = performance.now();
  const brief = await buildTripBrief(trip);
  console.log(`(${((performance.now() - t0) / 1000).toFixed(1)}s)`);
  if (!brief) { console.log("(no brief: the plan would fall back to the fixed lanes)"); continue; }
  console.log(`famous for: ${brief.famousFor}  [confidence: ${brief.confidence}]`);
  for (const kind of brief.kinds) {
    console.log(`  w${kind.weight} ${kind.origin.padEnd(9)} ${kind.scale === "day_trip" ? "DAY TRIP " : "         "}${kind.label} — ${kind.why}`);
    console.log(`        places: ${kind.placeQuery || "-"}   events: ${kind.eventQuery || "-"}`);
  }
  const { placeLimit, calls } = planBreadth({ days: trip.days, existing: [], location: trip.destination, kinds: brief.kinds, hasDates: Boolean(trip.startDate) });
  console.log(`-> keeps ${placeLimit} places; runs ${calls.length} searches:`);
  for (const call of calls) console.log(`   ${call.tool === "events" ? `events(${call.category ?? "what's on"})` : `places(${call.query})`}`);
}

process.exit(0);
