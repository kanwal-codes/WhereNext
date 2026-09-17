/**
 * Phase 3.2.1 (docs/overhaul/roadmap/phase-3-accuracy.md) — live gate for the evaluator wired
 * into the real finalize step. Reuses the exact 8 cases from `scripts/smoke-test-evaluator.ts`
 * (3.1.1's isolated gate), but now through `finalizeAssistantText` — the same function
 * `app/api/ai/route.ts` and the group-chat @Roam route actually call — to confirm the roadmap's
 * stated 3.2.1 gate: the fabricated-claim cases come back SOFTENED, and the clean cases come
 * back COMPLETELY UNTOUCHED (byte-identical to the draft).
 *
 *   bun run scripts/smoke-test-evaluator-e2e.ts
 *
 * Needs AI_GATEWAY_API_KEY in .env.local.
 */

import { finalizeAssistantText } from "../lib/application/evaluator";

type Case = { id: string; evidence: string; draft: string; expectUnchanged: boolean };

// Same 8 cases as scripts/smoke-test-evaluator.ts, without `note`/`expectFlagged` (renamed to the
// inverse `expectUnchanged` here since that's what this gate actually checks end-to-end) and with
// no allowed URLs (none of these drafts contain a link, so the regex sanitizer's link-stripping
// step is a no-op either way).
const CASES: Case[] = [
  { id: "fabricated-price", evidence: "Bistro Leon: mains run 22-30 EUR per person, per the restaurant's own menu.", draft: "Bistro Leon is great value — mains are around 60 EUR per person.", expectUnchanged: false },
  { id: "fabricated-hours", evidence: "The Rijksmuseum is closed on Mondays; open Tue-Sun 9am-5pm.", draft: "The Rijksmuseum is open every day of the week, including Mondays, from 9am to 5pm.", expectUnchanged: false },
  { id: "fabricated-neighborhood", evidence: "Hotel Belle Vue is located in Le Marais, a short walk from Place des Vosges.", draft: "Hotel Belle Vue is a charming stay right in the heart of Montmartre.", expectUnchanged: false },
  { id: "fabricated-rating", evidence: "Trattoria Rossi has a 3.6 rating from 210 reviews on the local review site.", draft: "Trattoria Rossi is very highly rated, at 4.9 stars.", expectUnchanged: false },
  { id: "exact-price", evidence: "A single metro fare is 3.75 CAD; a weekend unlimited pass is 15.25 CAD.", draft: "A single ride costs 3.75 CAD, or grab the weekend unlimited pass for 15.25 CAD.", expectUnchanged: true },
  { id: "reasonable-rounding", evidence: "Dinner for two at Cafe Nord typically runs 42-58 EUR total, per recent reviews.", draft: "Budget around 50 EUR for dinner for two at Cafe Nord.", expectUnchanged: true },
  { id: "subjective-advice", evidence: "Jardin du Luxembourg is a large public park with a central pond and manicured lawns.", draft: "Jardin du Luxembourg is a lovely, relaxing spot to unwind for an afternoon.", expectUnchanged: true },
  { id: "hedged-language", evidence: "Weather forecast: highs around 22C with a chance of afternoon showers.", draft: "Expect it to be warm, maybe around 22C, with a possible shower in the afternoon.", expectUnchanged: true },
  // Regression for a real bug found via live browser testing (2026-09-15): a real "cover charge +
  // opening hours" question produced a dense answer with several distinct unverified claims in
  // one sentence, and the old per-claim in-place replacement turned it into a broken, repetitive
  // mess ("is the standout pick something I couldn't fully verify — ... something I couldn't
  // fully verify, and it's something I couldn't fully verify (something I couldn't fully
  // verify)"). Not checked against `expectUnchanged` like the others — checked below for the
  // absence of that repetition instead, since whether THIS specific evaluator run flags 0, 1, or
  // several of these claims is itself non-deterministic.
  { id: "multi-claim-dense-answer", evidence: "Pub Wolf & Workman is a gastropub near Vieux-Port. No pricing, hours, or happy-hour information is available in the retrieved evidence.", draft: "Pub Wolf & Workman is the standout pick right by Vieux-Port — it's a gastropub, not a club, so there's no cover charge, and it's open Mon-Fri 11:30am-1am, Sat-Sun 10am-1am (happy hour runs 4-7pm daily).", expectUnchanged: false },
];

const HEDGE = "something I couldn't fully verify";

async function main() {
  let failures = 0;
  const noUrls = new Set<string>();
  for (const c of CASES) {
    const t0 = performance.now();
    const finalText = await finalizeAssistantText(c.draft, noUrls, c.evidence);
    const ms = Math.round(performance.now() - t0);
    const unchanged = finalText === c.draft;
    const hedgeCount = finalText.split(HEDGE).length - 1;
    // The real bug this last case guards against: multiple interleaved hedges in one sentence.
    // A single flagged claim still gets one precise in-place swap (hedgeCount === 1 is fine); two
    // or more must fall back to the single trailing caveat instead (hedgeCount === 0).
    const noRepeatedHedge = hedgeCount <= 1;
    const pass = c.id === "multi-claim-dense-answer" ? noRepeatedHedge : unchanged === c.expectUnchanged && noRepeatedHedge;
    if (!pass) failures += 1;
    console.log(`[${pass ? "PASS" : "FAIL"}] ${c.id} (${ms}ms) — unchanged=${unchanged}, hedgeCount=${hedgeCount}`);
    if (!unchanged) console.log(`  final: "${finalText}"`);
  }
  console.log(`\n=== Summary: ${CASES.length - failures}/${CASES.length} passed ===`);
  if (failures > 0) process.exit(1);
}

main();
