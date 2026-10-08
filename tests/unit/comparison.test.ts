import { afterEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateObject: generateObjectMock }));

import { buildComparison, comparedPlaceIds } from "../../lib/application/comparison";

const evidence = { places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" };

afterEach(() => {
  vi.restoreAllMocks();
});

const stubModel = (content: unknown) => {
  generateObjectMock.mockImplementation(async ({ schema }: { schema: { parse: (v: unknown) => unknown } }) => ({
    object: schema.parse(typeof content === "string" ? JSON.parse(content) : content),
    usage: { inputTokens: 10, outputTokens: 10 },
  }));
};

describe("buildComparison", () => {
  it("returns a comparison block from the model's structured output", async () => {
    stubModel({
      title: "Kyoto vs Kanazawa",
      columns: ["Option", "Quiet", "Food", "Travel time from Tokyo"],
      rows: [
        { label: "Kyoto", cells: ["Kyoto", "Medium", "Excellent", "2h20 Shinkansen"] },
        { label: "Kanazawa", cells: ["Kanazawa", "High", "Very good", "2h30 Shinkansen"] },
      ],
      bestForYou: { label: "Kanazawa", reason: "quieter for a couple who dislike crowds" },
    });
    const block = await buildComparison({ prompt: "compare Kyoto and Kanazawa", tripSummary: "couple, dislikes crowds", evidence });
    expect(block).toMatchObject({ type: "comparison", title: "Kyoto vs Kanazawa" });
    expect((block as { rows: Array<{ label: string }> }).rows.map((r) => r.label)).toEqual(["Kyoto", "Kanazawa"]);
    expect((block as { bestForYou: { label: string } }).bestForYou.label).toBe("Kanazawa");
  });

  it("returns null on a bad model response", async () => {
    stubModel("{}");
    expect(await buildComparison({ prompt: "compare a and b", tripSummary: "", evidence })).toBeNull();
  });
});

describe("comparedPlaceIds", () => {
  const shown = [
    { providerId: "p-bagel", name: "St-Viateur Bagel" },
    { providerId: "p-fair", name: "Fairmount Bagel" },
    { providerId: "p-olym", name: "Café Olimpico" },
  ];
  it("attaches the places when the compared options are those places, in the order compared", () => {
    expect(comparedPlaceIds([{ label: "Fairmount Bagel" }, { label: "St-Viateur Bagel" }], shown)).toEqual(["p-fair", "p-bagel"]);
    expect(comparedPlaceIds([{ label: "Cafe Olimpico" }, { label: "St Viateur Bagel, Mile End" }], shown)).toEqual(["p-olym", "p-bagel"]);
  });
  it("attaches nothing when two neighbourhoods are compared and some unrelated places were found", () => {
    expect(comparedPlaceIds([{ label: "Le Plateau" }, { label: "Mile End" }], shown)).toEqual([]);
  });
  it("needs two matches, so one lucky name is not a place comparison", () => {
    expect(comparedPlaceIds([{ label: "Fairmount Bagel" }, { label: "Mile End" }], shown)).toEqual([]);
  });
});
