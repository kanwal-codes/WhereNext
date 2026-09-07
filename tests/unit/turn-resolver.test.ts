import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTurn, resolvedTurnSchema } from "../../lib/application/turn-resolver";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

function mockModel(content: string) {
  process.env.AI_PROVIDER = "openai-compatible";
  process.env.AI_API_KEY = "test-key";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(content)));
}
/** Distinct responses per call — for exercising the 2-attempt retry. */
function mockModelSequence(...contents: string[]) {
  process.env.AI_PROVIDER = "openai-compatible";
  process.env.AI_API_KEY = "test-key";
  const fetchMock = vi.fn();
  for (const c of contents) fetchMock.mockResolvedValueOnce(reply(c));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

  it("reports which model actually produced the plan, for the turn trace", async () => {
    mockModel(JSON.stringify({ locationFocus: "Kyoto" }));
    const resolved = await resolveTurn({ message: "hi", history: [], tripSummary: "" });
    expect(resolved.modelUsed).toBe("gpt-4o"); // openai-compatible's default when AI_MODEL isn't set
  });

  it("fills defaults for a sparse response", async () => {
    mockModel(JSON.stringify({ locationFocus: "Kyoto" }));
    const resolved = await resolveTurn({ message: "hi", history: [], tripSummary: "" });
    expect(resolved).toMatchObject({ language: "en", locationFocus: "Kyoto", intent: "other", toolPlan: [], clarify: null, outOfScope: false });
  });

  it("reads outOfScope, defaulting it to false", async () => {
    mockModel(JSON.stringify({ intent: "other", outOfScope: true }));
    expect((await resolveTurn({ message: "solve 3x+2=11", history: [], tripSummary: "" })).outOfScope).toBe(true);
    mockModel(JSON.stringify({ intent: "activities", outOfScope: "nope" }));
    expect((await resolveTurn({ message: "bungee jumping spots?", history: [], tripSummary: "" })).outOfScope).toBe(false);
  });

  it("returns a safe default when the model output cannot be parsed", async () => {
    mockModel("not json at all");
    const resolved = await resolveTurn({ message: "hi", history: [], tripSummary: "" });
    expect(resolved).toEqual({ ...resolvedTurnSchema.parse({}), degraded: true });
  });

  it("drops a malformed tool call rather than crashing", async () => {
    mockModel(JSON.stringify({ language: "en", toolPlan: [{ tool: "search_places" }] }));
    const resolved = await resolveTurn({ message: "x", history: [], tripSummary: "" });
    expect(resolved.toolPlan).toEqual([]);
  });

  it("keeps up to six valid tool calls so multi-topic requests can render sections", async () => {
    mockModel(JSON.stringify({ language: "en", intent: "discovery", toolPlan: [
      { tool: "search_places", query: "food", location: "Montreal" },
      { tool: "search_places", query: "art museums", location: "Montreal" },
      { tool: "search_places", query: "parks", location: "Montreal" },
      { tool: "events", query: "concerts", location: "Montreal", category: "concerts" },
      { tool: "weather", location: "Montreal" },
      { tool: "research_web", query: "Montreal travel essentials" },
      { tool: "search_places", query: "shopping", location: "Montreal" },
    ] }));
    const resolved = await resolveTurn({ message: "food, museums, parks, concerts and weather", history: [], tripSummary: "" });
    expect(resolved.toolPlan).toHaveLength(6);
    expect(resolved.toolPlan[3]).toMatchObject({ tool: "events", category: "concerts" });
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

  it("parses an events tool call with artist / category / dateScoped", async () => {
    mockModel(JSON.stringify({
      language: "en", intent: "events",
      toolPlan: [{ tool: "events", query: "is Bruno Mars playing", location: "Montreal", artist: "Bruno Mars", category: "concerts", dateScoped: true }],
    }));
    const resolved = await resolveTurn({ message: "is Bruno Mars playing while we're there?", history: [], tripSummary: "" });
    expect(resolved.toolPlan[0]).toMatchObject({ tool: "events", artist: "Bruno Mars", category: "concerts", dateScoped: true });
  });

  it("tolerates a missing or garbage dateScoped without collapsing the tool plan", async () => {
    mockModel(JSON.stringify({ language: "en", intent: "events", toolPlan: [{ tool: "events", query: "comedy", location: "Montreal", dateScoped: "yes-please" }] }));
    const resolved = await resolveTurn({ message: "any comedy", history: [], tripSummary: "" });
    expect(resolved.toolPlan).toHaveLength(1);
    expect(resolved.toolPlan[0]).toMatchObject({ tool: "events", query: "comedy" });
    expect(resolved.toolPlan[0]).not.toHaveProperty("category");
    expect((resolved.toolPlan[0] as { dateScoped?: unknown }).dateScoped).toBeUndefined();
  });

  it("parses a clarifying question with chips, and drops a malformed one", async () => {
    mockModel(JSON.stringify({ language: "en", clarify: { question: "How many nights?", chips: ["2", "3-4"] } }));
    expect((await resolveTurn({ message: "x", history: [], tripSummary: "" })).clarify).toEqual({ question: "How many nights?", chips: ["2", "3-4"] });

    mockModel(JSON.stringify({ language: "en", clarify: { question: "", chips: 5 } }));
    expect((await resolveTurn({ message: "x", history: [], tripSummary: "" })).clarify).toBeNull();
  });

  it("parses suggestedFacts with a date window, and drops the whole array on a bad key", async () => {
    mockModel(JSON.stringify({ language: "en", suggestedFacts: [
      { key: "dates", display: "Mar 14–20", rationale: "they said mid-March for a week", startDate: "2027-03-14", endDate: "2027-03-20" },
    ] }));
    expect((await resolveTurn({ message: "x", history: [], tripSummary: "" })).suggestedFacts[0]).toMatchObject({ key: "dates", startDate: "2027-03-14", endDate: "2027-03-20" });

    mockModel(JSON.stringify({ language: "en", suggestedFacts: [{ key: "not_a_real_key", display: "x" }] }));
    expect((await resolveTurn({ message: "x", history: [], tripSummary: "" })).suggestedFacts).toEqual([]);
  });

  it("normalises a wild language code and reads capabilities", async () => {
    mockModel(JSON.stringify({ language: "definitely-not-bcp47", intent: "compare", capabilities: ["comparison", "comparison"] }));
    const resolved = await resolveTurn({ message: "A or B?", history: [], tripSummary: "" });
    expect(resolved.language).toBe("en");
    expect(resolved.capabilities).toEqual(["comparison"]); // deduped
  });

  it("retries once on an unparseable first response, then succeeds", async () => {
    const fetchMock = mockModelSequence("garbage no json", JSON.stringify({ language: "en", intent: "food", toolPlan: [] }));
    const resolved = await resolveTurn({ message: "food", history: [], tripSummary: "" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resolved.intent).toBe("food");
    expect(resolved.degraded).toBeUndefined(); // not the safe-default path

  });

  it("passes viewContext into the prompt so 'there' resolves to the open panel", async () => {
    const fetchMock = mockModelSequence(JSON.stringify({ language: "en", intent: "transport", toolPlan: [] }));
    await resolveTurn({ message: "how do I get there?", history: [], tripSummary: "trip: Lisbon", viewContext: "Hotel Memmo Alfama" });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    const userMsg = body.messages.find((m: { role: string }) => m.role === "user").content;
    expect(userMsg).toContain("Hotel Memmo Alfama");
    expect(userMsg).toMatch(/there.*this place.*it/i);
  });
});
