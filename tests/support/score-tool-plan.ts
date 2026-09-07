/** Grade one RESOLVE result against an expectation: did it pick the right intent, and the
 *  right set of tools? Tool order and duplicates don't matter — the plan is a set. */

export type PlanShape = { intent: string; tools: string[] };

export type PlanScore = {
  intentMatch: boolean;
  /** F1 of the tool set (1 when both are empty — "no tools" was the right call). */
  toolF1: number;
  missing: string[];
  extra: string[];
};

export function scoreToolPlan(expected: PlanShape, actual: PlanShape): PlanScore {
  const want = new Set(expected.tools);
  const got = new Set(actual.tools);
  const hits = [...want].filter((t) => got.has(t)).length;
  const missing = [...want].filter((t) => !got.has(t));
  const extra = [...got].filter((t) => !want.has(t));

  let toolF1: number;
  if (want.size === 0 && got.size === 0) {
    toolF1 = 1;
  } else if (hits === 0) {
    toolF1 = 0;
  } else {
    const precision = hits / got.size;
    const recall = hits / want.size;
    toolF1 = (2 * precision * recall) / (precision + recall);
  }

  return { intentMatch: expected.intent === actual.intent, toolF1, missing, extra };
}

/** Aggregate a run of scores into the two numbers a model-swap decision hangs on. */
export function summariseScores(scores: PlanScore[]) {
  const n = scores.length || 1;
  return {
    count: scores.length,
    intentAccuracy: scores.filter((s) => s.intentMatch).length / n,
    meanToolF1: scores.reduce((sum, s) => sum + s.toolF1, 0) / n,
  };
}
