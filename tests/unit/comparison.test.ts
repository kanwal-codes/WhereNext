import { afterEach, describe, expect, it, vi } from "vitest";
import { buildComparison } from "../../lib/application/comparison";

const evidence = { places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" };

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
});

describe("buildComparison", () => {
  it("returns a comparison block from the model's structured output", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "Kyoto vs Kanazawa",
      columns: ["Option", "Quiet", "Food", "Travel time from Tokyo"],
      rows: [
        { label: "Kyoto", cells: ["Kyoto", "Medium", "Excellent", "2h20 Shinkansen"] },
        { label: "Kanazawa", cells: ["Kanazawa", "High", "Very good", "2h30 Shinkansen"] },
      ],
      bestForYou: { label: "Kanazawa", reason: "quieter for a couple who dislike crowds" },
    }) } }] }), { status: 200 })));
    const block = await buildComparison({ prompt: "compare Kyoto and Kanazawa", tripSummary: "couple, dislikes crowds", evidence });
    expect(block).toMatchObject({ type: "comparison", title: "Kyoto vs Kanazawa" });
    expect((block as { rows: Array<{ label: string }> }).rows.map((r) => r.label)).toEqual(["Kyoto", "Kanazawa"]);
    expect((block as { bestForYou: { label: string } }).bestForYou.label).toBe("Kanazawa");
  });

  it("returns null on a bad model response", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 })));
    expect(await buildComparison({ prompt: "compare a and b", tripSummary: "", evidence })).toBeNull();
  });
});
