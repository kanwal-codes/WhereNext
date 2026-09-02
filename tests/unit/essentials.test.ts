import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEssentialsChecklist } from "../../lib/application/essentials";

const emptyEvidence = { places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" };

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
});

describe("buildEssentialsChecklist", () => {
  it("parses the model's checklist into a block", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      groups: [
        { title: "Packing", items: [{ text: "Rain shell", why: "showers likely in November" }] },
        { title: "Documents & entry", items: [{ text: "Check visa on the official portal", why: "rules change" }] },
      ],
    }) } }] }), { status: 200 })));
    const block = await buildEssentialsChecklist({ destination: "Lisbon", tripSummary: "2 travellers, November", evidence: { ...emptyEvidence, weather: "12-17C, rain" } });
    expect(block).toMatchObject({ type: "checklist" });
    expect((block as { groups: Array<{ title: string }> }).groups.map((g) => g.title)).toEqual(["Packing", "Documents & entry"]);
  });

  it("returns null when the model output is unusable", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "no json here" } }] }), { status: 200 })));
    expect(await buildEssentialsChecklist({ destination: "Lisbon", tripSummary: "", evidence: emptyEvidence })).toBeNull();
  });
});
