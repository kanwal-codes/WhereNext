/**
 * Phase 2.4.1 (docs/overhaul/roadmap/phase-2-speed.md) — measures whether Vercel AI Gateway's
 * `caching: 'auto'` does anything real for RESOLVE's actual chain, before wiring it into the
 * app. Sends RESOLVE's real (large, ~16KB) system prompt twice per model, with and without the
 * flag, and reports `usage.inputTokenDetails.cacheReadTokens` + latency for each — the docs'
 * own recommended way to confirm a cache hit (no separate cache-hit boolean exists).
 *
 *   bun run scripts/measure-resolve-caching.ts
 */
import { gateway, generateObject } from "ai";
import { z } from "zod";
import { SYSTEM as RESOLVE_SYSTEM } from "../lib/application/turn-resolver";

const schema = z.object({ intent: z.string() });
const prompt = "is $150 a day enough for Lisbon?";

async function run(label: string, modelId: string, only: string[] | undefined, caching: boolean) {
  const providerOptions = {
    gateway: { ...(only ? { only } : {}), ...(caching ? { caching: "auto" as const } : {}) },
  };
  const timings: number[] = [];
  const cacheReads: number[] = [];
  for (let i = 0; i < 2; i += 1) {
    const t0 = performance.now();
    try {
      const result = await generateObject({
        model: gateway(modelId),
        schema,
        messages: [{ role: "system", content: RESOLVE_SYSTEM }, { role: "user", content: prompt }],
        allowSystemInMessages: true,
        providerOptions,
      });
      timings.push(Math.round(performance.now() - t0));
      cacheReads.push(result.usage.inputTokenDetails?.cacheReadTokens ?? 0);
    } catch (error) {
      console.log(`  [${label}] call ${i + 1} ERROR after ${Math.round(performance.now() - t0)}ms:`, error instanceof Error ? error.message : error);
      timings.push(-1);
      cacheReads.push(-1);
    }
  }
  console.log(`[${label}] timings=${timings.join(", ")}ms  cacheReadTokens=${cacheReads.join(", ")}`);
}

async function main() {
  console.log(`RESOLVE system prompt length: ${RESOLVE_SYSTEM.length} chars\n`);
  await run("cerebras-pinned, no caching flag", "openai/gpt-oss-120b", ["cerebras"], false);
  await run("cerebras-pinned, caching:auto", "openai/gpt-oss-120b", ["cerebras"], true);
  await run("gemini fallback, no caching flag", "google/gemini-3.8-flash", undefined, false);
  await run("gemini fallback, caching:auto", "google/gemini-3.8-flash", undefined, true);
}

main();
