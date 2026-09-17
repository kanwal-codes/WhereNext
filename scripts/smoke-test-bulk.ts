/**
 * Phase 2.2.2 (docs/overhaul/roadmap/phase-2-speed.md) — live smoke test for every `bulk`
 * block-builder now that `openai/gpt-oss-120b` pinned to Cerebras leads the `bulk` chain too.
 * Runs each builder against a realistic evidence bundle through the real Gateway (no mocks),
 * confirms each still produces a correctly-typed block, and notes latency.
 *
 *   bun run scripts/smoke-test-bulk.ts
 */

import { buildItineraryPlan } from "../lib/application/itinerary-plan";
import { buildBudgetBreakdown } from "../lib/application/budget-plan";
import { buildComparison } from "../lib/application/comparison";
import { buildEssentialsChecklist } from "../lib/application/essentials";
import { buildStructuredAnswer } from "../lib/application/structured-answer";
import { buildExploreOptions } from "../lib/application/explore-options";
import type { RetrievedEvidence } from "../lib/application/retrieve";
import type { Place } from "../packages/contracts/place";

const place = (name: string, category: string): Place => ({
  provider: "google-places", providerId: `g:${name.toLowerCase().replace(/\W+/g, "-")}`, name, category,
  latitude: 38.71, longitude: -9.13, address: `${name}, Lisbon, Portugal`, rating: 4.5, userRatingCount: 500,
  sourceUrl: `https://maps.google.com/?q=${encodeURIComponent(name)}`, photoNames: [],
});

const evidence: RetrievedEvidence = {
  places: [place("Torre de Belém", "tourist_attraction"), place("Time Out Market", "market"), place("Miradouro da Graça", "tourist_attraction")],
  sources: [{ title: "Lisbon travel guide", url: "https://example.com/lisbon", content: "Lisbon is known for its hills, trams, and pastel de nata. Alfama is the oldest, most atmospheric neighborhood." }],
  weather: "22°C, sunny",
  routes: [],
  events: [],
  flights: [],
  stays: [],
  unavailableProviders: [],
  retrievedAt: new Date().toISOString(),
};

const tripCtx = { places: [], itinerary: [], preferences: {}, trip: { name: "Lisbon trip", destination: "Lisbon, Portugal", origin: null, duration_days: 5, start_date: "2027-05-10", end_date: "2027-05-14", travelers: 2 } };

async function timed<T>(id: string, fn: () => Promise<T & { type?: string } | null>) {
  const t0 = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - t0);
  console.log(`[${id}] ${ms}ms -> ${result ? `type=${(result as { type?: string }).type}` : "null"}`);
  return { id, ms, ok: Boolean(result) };
}

async function main() {
  const results = [
    await timed("itinerary", () => buildItineraryPlan({ prompt: "plan our days", tripSummary: "5-day trip to Lisbon, 2 travelers.", evidence, tripCtx, language: "en" })),
    await timed("budget", () => buildBudgetBreakdown({ prompt: "how much should we budget per day", tripSummary: "5-day trip to Lisbon, 2 travelers.", currency: "USD", evidence, tripCtx: { places: [] }, language: "en" })),
    await timed("comparison", () => buildComparison({ prompt: "Belém tower vs the market, which first?", tripSummary: "5-day trip to Lisbon, 2 travelers.", evidence, language: "en" })),
    await timed("essentials", () => buildEssentialsChecklist({ destination: "Lisbon, Portugal", tripSummary: "5-day trip to Lisbon, 2 travelers.", evidence, language: "en" })),
    await timed("structured-answer", () => buildStructuredAnswer({ prompt: "is Lisbon walkable?", tripSummary: "5-day trip to Lisbon, 2 travelers.", evidence, language: "en" })),
    await timed("explore-options", () => buildExploreOptions({ kind: "area", prompt: "which neighborhood should we stay in?", tripSummary: "5-day trip to Lisbon, 2 travelers.", evidence, tripCtx: { preferences: {} }, language: "en" })),
  ];
  console.log("\n=== Summary ===");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL (null block)"} ${r.id}: ${r.ms}ms`);
}

main();
