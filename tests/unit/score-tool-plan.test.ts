import { describe, expect, it } from "vitest";
import { scoreToolPlan, summariseScores } from "../support/score-tool-plan";

describe("scoreToolPlan", () => {
  it("rewards an exact match", () => {
    const s = scoreToolPlan({ intent: "stays", tools: ["stays"] }, { intent: "stays", tools: ["stays"] });
    expect(s).toMatchObject({ intentMatch: true, toolF1: 1, missing: [], extra: [] });
  });

  it("scores 'no tools was right' as F1 = 1", () => {
    const s = scoreToolPlan({ intent: "trip_memory", tools: [] }, { intent: "trip_memory", tools: [] });
    expect(s.toolF1).toBe(1);
  });

  it("penalises a missing tool and an extra tool via F1", () => {
    // want {a,b}, got {a,c}: precision 1/2, recall 1/2 -> F1 0.5
    const s = scoreToolPlan({ intent: "x", tools: ["a", "b"] }, { intent: "x", tools: ["a", "c"] });
    expect(s.toolF1).toBeCloseTo(0.5);
    expect(s.missing).toEqual(["b"]);
    expect(s.extra).toEqual(["c"]);
  });

  it("scores a total tool miss as 0 and flags the intent mismatch", () => {
    const s = scoreToolPlan({ intent: "weather", tools: ["weather"] }, { intent: "other", tools: [] });
    expect(s).toMatchObject({ intentMatch: false, toolF1: 0 });
  });

  it("ignores tool order and duplicates", () => {
    const s = scoreToolPlan({ intent: "x", tools: ["a", "b"] }, { intent: "x", tools: ["b", "a", "a"] });
    expect(s.toolF1).toBe(1);
  });

  it("summarises a run", () => {
    const agg = summariseScores([
      scoreToolPlan({ intent: "a", tools: [] }, { intent: "a", tools: [] }),
      scoreToolPlan({ intent: "b", tools: ["x"] }, { intent: "c", tools: [] }),
    ]);
    expect(agg).toMatchObject({ count: 2, intentAccuracy: 0.5, meanToolF1: 0.5 });
  });
});
