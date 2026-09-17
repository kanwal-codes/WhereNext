/**
 * Phase 3.1.1 (docs/overhaul/roadmap/phase-3-accuracy.md) — live gate for the grounding evaluator
 * (`lib/application/evaluator.ts`). The roadmap's explicit exit criteria for sub-phase 3.1: the
 * evaluator must correctly judge 100% of a hand-built test set, run in isolation (no wiring into
 * the real COMPOSE path), before it's allowed to touch real traffic. A mocked unit test can't
 * answer this — it would only prove the wiring, not whether a real cheap model can actually tell
 * a fabricated claim from a grounded one.
 *
 *   bun run scripts/smoke-test-evaluator.ts
 *
 * Needs AI_GATEWAY_API_KEY in .env.local.
 */

import { evaluateGrounding } from "../lib/application/evaluator";

type Case = { id: string; evidence: string; draft: string; expectFlagged: boolean; note: string };

const CASES: Case[] = [
  // --- Fabricated claims: must be flagged ---
  {
    id: "fabricated-price",
    evidence: "Bistro Leon: mains run 22-30 EUR per person, per the restaurant's own menu.",
    draft: "Bistro Leon is great value — mains are around 60 EUR per person.",
    expectFlagged: true,
    note: "answer's price is roughly double the actual evidence range, not a rounding",
  },
  {
    id: "fabricated-hours",
    evidence: "The Rijksmuseum is closed on Mondays; open Tue-Sun 9am-5pm.",
    draft: "The Rijksmuseum is open every day of the week, including Mondays, from 9am to 5pm.",
    expectFlagged: true,
    note: "directly contradicts the evidence's Monday closure",
  },
  {
    id: "fabricated-neighborhood",
    evidence: "Hotel Belle Vue is located in Le Marais, a short walk from Place des Vosges.",
    draft: "Hotel Belle Vue is a charming stay right in the heart of Montmartre.",
    expectFlagged: true,
    note: "wrong neighborhood entirely, not adjacent or approximate",
  },
  {
    id: "fabricated-rating",
    evidence: "Trattoria Rossi has a 3.6 rating from 210 reviews on the local review site.",
    draft: "Trattoria Rossi is very highly rated, at 4.9 stars.",
    expectFlagged: true,
    note: "invented rating, nowhere close to the real 3.6",
  },
  // --- Genuinely grounded: must NOT be flagged ---
  {
    id: "exact-price",
    evidence: "A single metro fare is 3.75 CAD; a weekend unlimited pass is 15.25 CAD.",
    draft: "A single ride costs 3.75 CAD, or grab the weekend unlimited pass for 15.25 CAD.",
    expectFlagged: false,
    note: "verbatim figures from the evidence",
  },
  {
    id: "reasonable-rounding",
    evidence: "Dinner for two at Cafe Nord typically runs 42-58 EUR total, per recent reviews.",
    draft: "Budget around 50 EUR for dinner for two at Cafe Nord.",
    expectFlagged: false,
    note: "a natural rounding/paraphrase of a real range, not a fabrication",
  },
  {
    id: "subjective-advice",
    evidence: "Jardin du Luxembourg is a large public park with a central pond and manicured lawns.",
    draft: "Jardin du Luxembourg is a lovely, relaxing spot to unwind for an afternoon.",
    expectFlagged: false,
    note: "subjective opinion, no specific checkable fact",
  },
  {
    id: "common-knowledge-geography",
    evidence: "Trip context: a 6-night Montreal trip for 4 travelers.",
    draft: "Yes — Montreal is in Canada, in the province of Quebec.",
    expectFlagged: false,
    note: "live-found regression (2026-09-16): a basic, uncontroversial geography fact was flagged just because the trip-context evidence doesn't happen to mention it, swallowing a correct one-line answer into a useless hedge",
  },
  {
    id: "hedged-language",
    evidence: "Weather forecast: highs around 22C with a chance of afternoon showers.",
    draft: "Expect it to be warm, maybe around 22C, with a possible shower in the afternoon.",
    expectFlagged: false,
    note: "hedged language matching the evidence's own uncertainty",
  },
];

async function main() {
  let failures = 0;
  for (const c of CASES) {
    const t0 = performance.now();
    const result = await evaluateGrounding(c.draft, c.evidence);
    const ms = Math.round(performance.now() - t0);
    const flagged = result.unsupportedClaims.length > 0;
    const pass = flagged === c.expectFlagged;
    if (!pass) failures += 1;
    console.log(`[${pass ? "PASS" : "FAIL"}] ${c.id} (${ms}ms) — expected ${c.expectFlagged ? "flagged" : "clean"}, got ${flagged ? "flagged" : "clean"}`);
    console.log(`  note: ${c.note}`);
    if (result.unsupportedClaims.length) console.log(`  flagged: ${JSON.stringify(result.unsupportedClaims)}`);
  }
  console.log(`\n=== Summary: ${CASES.length - failures}/${CASES.length} passed ===`);
  if (failures > 0) process.exit(1);
}

main();
