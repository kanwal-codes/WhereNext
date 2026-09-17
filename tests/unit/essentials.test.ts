import { afterEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateObject: generateObjectMock }));

import { buildEssentialsChecklist } from "../../lib/application/essentials";

const emptyEvidence = { places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" };

afterEach(() => {
  vi.restoreAllMocks();
});

const stubModel = (content: unknown) => {
  generateObjectMock.mockImplementation(async ({ schema }: { schema: { parse: (v: unknown) => unknown } }) => ({
    object: schema.parse(typeof content === "string" ? JSON.parse(content) : content),
    usage: { inputTokens: 10, outputTokens: 10 },
  }));
};

describe("buildEssentialsChecklist", () => {
  it("parses the model's checklist into a block", async () => {
    stubModel({
      groups: [
        { title: "Packing", items: [{ text: "Rain shell", why: "showers likely in November" }] },
        { title: "Documents & entry", items: [{ text: "Check visa on the official portal", why: "rules change" }] },
      ],
    });
    const block = await buildEssentialsChecklist({ destination: "Lisbon", tripSummary: "2 travellers, November", evidence: { ...emptyEvidence, weather: "12-17C, rain" } });
    expect(block).toMatchObject({ type: "checklist" });
    expect((block as { groups: Array<{ title: string }> }).groups.map((g) => g.title)).toEqual(["Packing", "Documents & entry"]);
  });

  it("returns null when the model output is unusable", async () => {
    stubModel("no json here");
    expect(await buildEssentialsChecklist({ destination: "Lisbon", tripSummary: "", evidence: emptyEvidence })).toBeNull();
  });
});
