import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTurn, resolvedTurnSchema } from "../../lib/application/turn-resolver";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

function mockModel(content: string) {
  process.env.AI_PROVIDER = "openai-compatible";
  process.env.AI_API_KEY = "test-key";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })));
}

describe("resolveTurn", () => {
  it("parses the model's plan", async () => {
    mockModel(JSON.stringify({
      language: "hi", locationFocus: "Shanghai", intent: "discovery", wantsComparison: false,
      toolPlan: [{ tool: "search_places", query: "tech places", location: "Shanghai" }],
      suggestedFollowups: [{ label: "Museums", prompt: "Show museums in Shanghai" }],
    }));
    const resolved = await resolveTurn({ message: "tech places in shanghai", history: [], tripSummary: "trip: China" });
    expect(resolved).toMatchObject({ language: "hi", locationFocus: "Shanghai", intent: "discovery" });
    expect(resolved.toolPlan[0]).toMatchObject({ tool: "search_places", location: "Shanghai" });
  });

  it("fills defaults for a sparse response", async () => {
    mockModel(JSON.stringify({ locationFocus: "Kyoto" }));
    const resolved = await resolveTurn({ message: "hi", history: [], tripSummary: "" });
    expect(resolved).toMatchObject({ language: "en", locationFocus: "Kyoto", intent: "other", toolPlan: [], clarify: null });
  });

  it("returns a safe default when the model output cannot be parsed", async () => {
    mockModel("not json at all");
    const resolved = await resolveTurn({ message: "hi", history: [], tripSummary: "" });
    expect(resolved).toEqual(resolvedTurnSchema.parse({}));
  });

  it("drops a malformed tool call rather than crashing", async () => {
    mockModel(JSON.stringify({ language: "en", toolPlan: [{ tool: "search_places" }] }));
    const resolved = await resolveTurn({ message: "x", history: [], tripSummary: "" });
    expect(resolved.toolPlan).toEqual([]);
  });

  it("parses a directions tool call", async () => {
    mockModel(JSON.stringify({ language: "en", intent: "transport", toolPlan: [{ tool: "directions", from: "Jerónimos Monastery", to: "Belém Tower", mode: "walking" }] }));
    const resolved = await resolveTurn({ message: "can we walk from the monastery to the tower?", history: [], tripSummary: "" });
    expect(resolved.toolPlan[0]).toEqual({ tool: "directions", from: "Jerónimos Monastery", to: "Belém Tower", mode: "walking" });
  });

  it("carries a stated dislike as a proposedProfileUpdate", async () => {
    mockModel(JSON.stringify({ language: "en", intent: "chitchat", toolPlan: [], proposedProfileUpdate: { dislikes: ["bungee jumping"] } }));
    const resolved = await resolveTurn({ message: "I don't like bungee jumping", history: [], tripSummary: "" });
    expect(resolved.proposedProfileUpdate).toEqual({ dislikes: ["bungee jumping"] });
  });
});
