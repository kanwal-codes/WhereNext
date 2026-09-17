/**
 * Phase 2.5.2 (docs/overhaul/roadmap/phase-2-speed.md) — live smoke test for the trivial-turn
 * short-circuit through the real pipeline (no mocks): a real trivial message ("hi") must skip
 * RESOLVE/RETRIEVE entirely, and a real non-trivial message that merely starts with a similar
 * word ("hey, what's good in Rome?") must still run the full pipeline correctly.
 *
 *   bun run scripts/smoke-test-trivial-turn.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAssistantTurn } from "../lib/application/orchestrate/run-turn";
import type { TripContext } from "../lib/application/trip-context";

const tripCtx: TripContext = {
  trip: { name: "Rome trip", destination: "Rome, Italy", origin: null, duration_days: 5, travelers: 2, start_date: "2027-06-10", end_date: "2027-06-15" },
  preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], lockedStay: null, accommodationAnchor: null, places: [], decisions: [],
};
// A stub, not a real DB — the trivial path never touches supabase at all; the non-trivial path's
// only calls are fire-and-forget / no-op for a plan with no trip-fact update, both already
// swallow their own errors, so a stub is safe for what this script actually verifies.
const fakeSupabase = {
  from: () => ({
    select: () => ({ eq: async () => ({ data: [], error: null }) }),
    update: () => ({ eq: () => ({ eq: async () => ({ data: null, error: null }) }) }),
    upsert: async () => ({ data: null, error: null }),
  }),
} as unknown as SupabaseClient;
const deps = { supabase: fakeSupabase, tripId: "11111111-1111-4111-8111-111111111111" };

async function main() {
  console.log("--- trivial: \"hi\" ---");
  const t0 = performance.now();
  const trivial = await runAssistantTurn(deps, { tripCtx, prompt: "hi", history: [], tripSummary: "Rome trip, 2 travelers." });
  console.log(`  ${Math.round(performance.now() - t0)}ms, kind=${trivial.kind}, resolveMs=${trivial.timings.resolveMs}, retrieveMs=${trivial.timings.retrieveMs ?? "(skipped)"}`);
  if (trivial.kind === "ready") {
    console.log(`  toolPlan=${JSON.stringify(trivial.toolPlan)}, composeTools keys=${JSON.stringify(Object.keys(trivial.composeTools))}`);
    console.log(`  system: ${trivial.system}`);
  }
  console.log(trivial.kind === "ready" && trivial.toolPlan.length === 0 && Object.keys(trivial.composeTools).length === 0 ? "PASS — short-circuited, no tools" : "FAIL — did not short-circuit as expected");

  console.log("\n--- non-trivial: \"hey, what's good in Rome?\" ---");
  const t1 = performance.now();
  const real = await runAssistantTurn(deps, { tripCtx, prompt: "hey, what's good in Rome?", history: [], tripSummary: "Rome trip, 2 travelers." });
  console.log(`  ${Math.round(performance.now() - t1)}ms, kind=${real.kind}, resolveMs=${real.timings.resolveMs}, retrieveMs=${real.timings.retrieveMs ?? "(none)"}`);
  if (real.kind === "ready") {
    console.log(`  intent=${real.resolved.intent}, toolPlan=${JSON.stringify(real.toolPlan)}`);
  } else {
    console.log(`  content=${JSON.stringify((real as { content?: string }).content)}`);
  }
  console.log(real.timings.resolveMs > 0 ? "PASS — ran the real RESOLVE call" : "FAIL — resolveMs was 0, looks short-circuited");
}

main();
