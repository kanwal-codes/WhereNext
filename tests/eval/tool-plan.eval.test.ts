import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
  process.env.AI_PROVIDER = "openai-compatible";
  process.env.AI_API_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(idealJson) } }] }), { status: 200 }),
    ),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  if (!LIVE) {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
  }
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
