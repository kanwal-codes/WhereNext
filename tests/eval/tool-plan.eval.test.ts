import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Montreal QA pass (2026-09-16): every non-LIVE case in this file was failing with intent
// "other" (`resolveTurn`'s own degraded fallback) instead of the replayed `ideal.intent`. Root
// cause: this mocked fetch + AI_PROVIDER="openai-compatible" — a leftover from before the
// provider chain was consolidated behind the Vercel AI Gateway's own `generateObject` call
// (see the "every provider now goes through the SAME client" comment in packages/ai/gateway.ts).
// `gateway()`/`generateObject` never reads AI_PROVIDER/AI_API_KEY and doesn't necessarily reach
// the stubbed global fetch either, so every replayed call threw, `resolveTurn` exhausted both
// attempts, and fell back to `resolvedTurnSchema.parse({})` — intent "other" by construction.
// Fixed by mocking `generateObject` itself, the same pattern already used by
// tests/unit/evaluator.test.ts for the exact same underlying call.
const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateObject: generateObjectMock }));

import { resolveTurn } from "@/lib/application/turn-resolver";
import { RESOLVE_GRADE_SET } from "../support/resolve-grade-set";
import { scoreToolPlan, summariseScores, type PlanScore } from "../support/score-tool-plan";

/**
 * RESOLVE routing accuracy — the single biggest quality lever, and previously unmeasured.
 *
 *   default        replay each case's hand-authored `ideal` model response through the real
 *                  resolver: guards the parse + routing path for every intent family in CI,
 *                  no network.
 *   EVAL_LIVE=1    run the whole grade set against the configured RESOLVE_MODEL, print a
 *                  scored table, and assert aggregate floors. This is the check to run before
 *                  swapping RESOLVE to a faster/cheaper model.
 */

const LIVE = process.env.EVAL_LIVE === "1";
const collected: Array<{ id: string; score: PlanScore; got: { intent: string; tools: string[] } }> = [];

function replay(idealJson: unknown) {
  generateObjectMock.mockImplementation(async ({ schema }: { schema: { parse: (v: unknown) => unknown } }) => ({
    object: schema.parse(idealJson),
    usage: { inputTokens: 10, outputTokens: 10 },
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe(`RESOLVE tool-plan accuracy${LIVE ? " (LIVE)" : " (replayed)"}`, () => {
  const cases = LIVE ? RESOLVE_GRADE_SET : RESOLVE_GRADE_SET.filter((c) => c.ideal);

  if (LIVE) {
    // The live run needs real keys; vitest does not load `.env.local` on its own.
    beforeAll(async () => {
      const { loadEnvConfig } = await import("@next/env");
      loadEnvConfig(process.cwd());
    });
  }

  for (const c of cases) {
    it(c.id, async () => {
      if (!LIVE) replay(c.ideal);
      const resolved = await resolveTurn({ message: c.message, history: [], tripSummary: c.tripSummary });
      const got = { intent: resolved.intent, tools: resolved.toolPlan.map((t) => t.tool) };
      const score = scoreToolPlan(c.expect, got);
      collected.push({ id: c.id, score, got });

      if (LIVE) {
        // Soft per-case gate live: a reasonable extra tool is fine, a wrong family is not.
        expect(score.toolF1, `${c.id}: tools ${JSON.stringify(got.tools)} vs want ${JSON.stringify(c.expect.tools)}`).toBeGreaterThanOrEqual(0.5);
      } else {
        // The ideal response is correct by construction — this pins the resolver's parse + routing.
        expect(score.intentMatch, `${c.id}: intent ${got.intent} ≠ ${c.expect.intent}`).toBe(true);
        expect(score.toolF1, `${c.id}: tools ${JSON.stringify(got.tools)} ≠ ${JSON.stringify(c.expect.tools)}`).toBe(1);
      }
    });
  }

  afterAll(() => {
    if (collected.length === 0) return;
    const agg = summariseScores(collected.map((r) => r.score));
    const rows = collected
      .map((r) => `  ${r.score.intentMatch ? "·" : "x"} F1 ${r.score.toolF1.toFixed(2)}  ${r.id}  ->  ${JSON.stringify(r.got.tools)}`)
      .join("\n");
    console.log(`\nRESOLVE grade set — ${agg.count} cases · intent ${(agg.intentAccuracy * 100).toFixed(0)}% · mean tool-F1 ${agg.meanToolF1.toFixed(2)}\n${rows}\n`);
    if (LIVE) {
      expect(agg.intentAccuracy, "intent accuracy floor").toBeGreaterThanOrEqual(0.8);
      expect(agg.meanToolF1, "mean tool-F1 floor").toBeGreaterThanOrEqual(0.7);
    }
  });
});
