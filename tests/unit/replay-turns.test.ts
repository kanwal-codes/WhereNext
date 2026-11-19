import { describe, expect, it } from "vitest";
import { compareRoutes, routeSignature } from "../../scripts/replay-turns";

describe("replay route comparison", () => {
  const recorded = { intent: "transport", capabilities: [], toolPlan: [{ tool: "flights" }, { tool: "research_web" }] };

  it("describes a plan the same way whatever order its tools came in", () => {
    expect(routeSignature(recorded)).toBe("transport | caps:none | tools:flights+research_web");
    expect(routeSignature({ ...recorded, toolPlan: [{ tool: "research_web" }, { tool: "flights" }, { tool: "flights" }] })).toBe(routeSignature(recorded));
  });

  it("counts how many re-runs agree with the recording and lists the other plans", () => {
    const other = { intent: "stays", toolPlan: [{ tool: "stays" }] };
    const c = compareRoutes(recorded, [recorded, other, recorded]);
    expect(c.same).toBe(2);
    expect(c.runs).toBe(3);
    expect(c.distinct).toHaveLength(2);
  });

  it("marks a clarifying question and a decline in the plan", () => {
    expect(routeSignature({ intent: "other", clarify: { question: "?" } })).toContain("clarify");
    expect(routeSignature({ intent: "other", outOfScope: true })).toContain("out-of-scope");
  });
});
