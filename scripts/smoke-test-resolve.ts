/**
 * Phase 2.2.1 (docs/overhaul/roadmap/phase-2-speed.md) — live smoke test for RESOLVE now that
 * `openai/gpt-oss-120b` pinned to Cerebras leads the `resolve` chain. Runs real prompts through
 * the real Gateway (no mocks) across the same prompt shapes as the original research smoke test
 * (budget, restaurant, comparison, chitchat, etc.), and checks:
 *   (a) latency lands in the 718ms-5.4s range already measured for the Cerebras-pinned call
 *   (b) capabilities/toolPlan/proposedProfileUpdate are populated sensibly — not byte-identical
 *       to a prior Gemini run (a different model will phrase/plan things slightly differently),
 *       but structurally correct for what each prompt is actually asking.
 *
 *   bun run scripts/smoke-test-resolve.ts
 *
 * Needs AI_GATEWAY_API_KEY in .env.local. No separate Cerebras credential — pinning routes
 * through the same Gateway/key, per docs/overhaul/chatbot-overhaul/speed-and-latency.md.
 */

import { resolveTurn } from "../lib/application/turn-resolver";

const PROMPTS: Array<{ id: string; message: string; tripSummary: string }> = [
  { id: "budget", message: "is $150 a day enough for Lisbon?", tripSummary: "5-day trip to Lisbon, Portugal, 2 travelers." },
  { id: "restaurant", message: "best seafood restaurants near Alfama", tripSummary: "5-day trip to Lisbon, Portugal, 2 travelers." },
  { id: "comparison", message: "should we stay in Alfama or Bairro Alto?", tripSummary: "5-day trip to Lisbon, Portugal, 2 travelers." },
  { id: "chitchat", message: "thanks, this is really helpful!", tripSummary: "5-day trip to Lisbon, Portugal, 2 travelers." },
  { id: "events", message: "any concerts happening while we're there?", tripSummary: "5-day trip to Lisbon, Portugal, 2 travelers, dates 2027-05-10 to 2027-05-14." },
  { id: "weather", message: "what's the weather like in May?", tripSummary: "5-day trip to Lisbon, Portugal, 2 travelers, dates 2027-05-10 to 2027-05-14." },
  { id: "directions", message: "how do we get from the airport to our hotel in Alfama?", tripSummary: "5-day trip to Lisbon, Portugal, 2 travelers." },
  { id: "preference-update", message: "I don't really like museums, and I'm vegetarian", tripSummary: "5-day trip to Lisbon, Portugal, 2 travelers." },
];

async function main() {
  const results: Array<{ id: string; ms: number; modelUsed?: string; capabilities: unknown; toolPlan: unknown; proposedProfileUpdate: unknown }> = [];
  for (const p of PROMPTS) {
    const t0 = performance.now();
    const resolved = await resolveTurn({ message: p.message, history: [], tripSummary: p.tripSummary });
    const ms = Math.round(performance.now() - t0);
    results.push({ id: p.id, ms, modelUsed: resolved.modelUsed, capabilities: resolved.capabilities, toolPlan: resolved.toolPlan, proposedProfileUpdate: resolved.proposedProfileUpdate });
    console.log(`[${p.id}] ${ms}ms model=${resolved.modelUsed}`);
    console.log(`  capabilities: ${JSON.stringify(resolved.capabilities)}`);
    console.log(`  toolPlan: ${JSON.stringify(resolved.toolPlan)}`);
    if (resolved.proposedProfileUpdate) console.log(`  proposedProfileUpdate: ${JSON.stringify(resolved.proposedProfileUpdate)}`);
    if (resolved.degraded) console.log(`  DEGRADED — fell back past Cerebras`);
  }
  console.log("\n=== Summary ===");
  const cerebras = results.filter((r) => r.modelUsed === "openai/gpt-oss-120b");
  console.log(`Cerebras answered: ${cerebras.length}/${results.length}`);
  if (cerebras.length) {
    const times = cerebras.map((r) => r.ms).sort((a, b) => a - b);
    console.log(`Latency range (Cerebras only): ${times[0]}ms - ${times[times.length - 1]}ms`);
  }
  for (const r of results) console.log(`${r.modelUsed === "openai/gpt-oss-120b" ? "PASS" : "FALLBACK"} ${r.id}: ${r.ms}ms (${r.modelUsed})`);
}

main();
