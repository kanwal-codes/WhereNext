import { afterEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateObject: generateObjectMock }));

import { buildBudgetBreakdown } from "../../lib/application/budget-plan";
import type { RetrievedEvidence } from "../../lib/application/retrieve";

const evidence = { places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" } as unknown as RetrievedEvidence;
const tripCtx = { places: [] } as never;

afterEach(() => {
  vi.restoreAllMocks();
});

/** bulk block-builders now call `generateObject` (via Gateway) instead of hand-parsing a raw
 *  fetch response — the mock still runs the schema, so it still exercises the builder's own
 *  post-processing/validation logic, just without a real network call. */
const stubModel = (content: unknown) => {
  generateObjectMock.mockImplementation(async ({ schema }: { schema: { parse: (v: unknown) => unknown } }) => ({
    object: schema.parse(typeof content === "string" ? JSON.parse(content) : content),
    usage: { inputTokens: 10, outputTokens: 10 },
  }));
};

describe("buildBudgetBreakdown", () => {
  it("builds a budget block and derives dailyTotal from the category columns", async () => {
    stubModel({
      currency: "CAD", perPerson: true, summary: "About 130 CAD/day each — comfortably under your 150 budget.",
      lines: [
        { category: "Food & drink", low: 30, typical: 55, high: 100, note: "casual spots" },
        { category: "Activities & sights", low: 10, typical: 35, high: 70 },
        { category: "Local transit", low: 8, typical: 12, high: 20 },
      ],
      setBudget: 150, tripNote: "~520 CAD each over 4 days, excludes flights & hotel",
    });
    const block = await buildBudgetBreakdown({ prompt: "how much per day?", tripSummary: "3 travellers, 4 days, Montreal", currency: "CAD", statedDailyBudget: 150, evidence, tripCtx });
    expect(block).toMatchObject({ type: "budget", currency: "CAD", perPerson: true, setBudget: 150 });
    const b = block as { dailyTotal: { low: number; typical: number; high: number }; lines: unknown[] };
    expect(b.dailyTotal).toEqual({ low: 48, typical: 102, high: 190 });
    expect(b.lines).toHaveLength(3);
  });

  it("falls back to the stated budget when the model omits setBudget", async () => {
    stubModel({ currency: "EUR", perPerson: true, summary: "~80/day.", lines: [
      { category: "Food", low: 20, typical: 40, high: 70 }, { category: "Transit", low: 5, typical: 10, high: 15 },
    ] });
    const block = await buildBudgetBreakdown({ prompt: "budget?", tripSummary: "solo, Lisbon", currency: "EUR", statedDailyBudget: 90, evidence, tripCtx });
    expect((block as { setBudget?: number }).setBudget).toBe(90);
  });

  it("returns null on an unparseable response", async () => {
    stubModel("nope");
    expect(await buildBudgetBreakdown({ prompt: "x", tripSummary: "", currency: "USD", evidence, tripCtx })).toBeNull();
  });
});
