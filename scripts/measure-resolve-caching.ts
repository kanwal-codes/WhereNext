/**
 * Measures whether Anthropic prompt caching does anything real for RESOLVE's actual system prompt
 * (~16KB, identical on every turn). Sends it twice per model, with and without the cache marker the app
 * sets (`withCachedSystem` in packages/ai/llm.ts), and reports `usage.inputTokenDetails.cacheReadTokens`
 * + latency for each — a cache hit shows up as cache-read tokens on the second call.
 *
 *   bun --env-file=.env.local run scripts/measure-resolve-caching.ts
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { SYSTEM as RESOLVE_SYSTEM } from "../lib/application/turn-resolver";

const schema = z.object({ intent: z.string() });
const prompt = "is $150 a day enough for Lisbon?";

async function run(modelId: string, caching: boolean) {
  const timings: number[] = [];
  const cacheReads: number[] = [];
  for (let i = 0; i < 2; i += 1) {
    const t0 = performance.now();
    try {
      const result = await generateObject({
        model: anthropic(modelId),
        schema,
        messages: [
          { role: "system", content: RESOLVE_SYSTEM, ...(caching ? { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } } : {}) },
          { role: "user", content: prompt },
        ],
        allowSystemInMessages: true,
      });
      timings.push(Math.round(performance.now() - t0));
      cacheReads.push(result.usage.inputTokenDetails?.cacheReadTokens ?? 0);
    } catch (error) {
      console.log(`  [${modelId}] call ${i + 1} ERROR:`, error instanceof Error ? error.message.slice(0, 160) : error);
      timings.push(-1);
      cacheReads.push(-1);
    }
  }
  console.log(`${modelId.padEnd(18)} caching=${String(caching).padEnd(5)} latency ms [${timings.join(", ")}]  cache-read tokens [${cacheReads.join(", ")}]`);
}

for (const id of ["claude-haiku-5-5", "claude-sonnet-5-5"]) {
  await run(id, false);
  await run(id, true);
}
