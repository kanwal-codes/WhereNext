import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBudgetBreakdown } from "../../lib/application/budget-plan";
import type { RetrievedEvidence } from "../../lib/application/retrieve";

const evidence = { places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" } as unknown as RetrievedEvidence;
const tripCtx = { places: [] } as never;

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
});

const stubModel = (content: unknown) => {
  process.env.AI_PROVIDER = "openai-compatible";
  process.env.AI_API_KEY = "k";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status: 200 }),
  ));
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
