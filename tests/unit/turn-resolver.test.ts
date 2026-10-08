import { afterEach, describe, expect, it, vi } from "vitest";

/** RESOLVE calls `generateObject` (via Gateway) instead of hand-parsing a raw fetch response —
 *  mock at that boundary. (Phase 2.6.1 tried `streamObject` here; live-verified to hang inside
 *  this app's actual Next.js route context, reverted — see `packages/ai/model-policy.ts`'s
 *  `generateStructured` doc comment.) The mock still runs the real schema through `schema.parse`,
 *  exactly like the real `generateObject` validates the model's JSON against the schema it was
 *  given, so every test below still exercises turn-resolver.ts's actual lenient-parsing logic
 *  (dropped malformed entries, coercions, defaults) — only the network call itself is faked. */
const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateObject: generateObjectMock }));

import { guardRepeatedClarify, resolveTurn, resolvedTurnSchema, routePracticalFacts } from "../../lib/application/turn-resolver";

afterEach(() => {
  vi.restoreAllMocks();
});

type Schema = { parse: (v: unknown) => unknown };

function mockModel(content: string) {
  generateObjectMock.mockImplementation(async ({ schema }: { schema: Schema }) => ({
    object: schema.parse(JSON.parse(content)),
    usage: { inputTokens: 10, outputTokens: 10 },
  }));
}
/** Distinct responses per call — for exercising the 2-attempt retry. */
function mockModelSequence(...contents: string[]) {
  for (const content of contents) {
    generateObjectMock.mockImplementationOnce(async ({ schema }: { schema: Schema }) => ({
      object: schema.parse(JSON.parse(content)),
      usage: { inputTokens: 10, outputTokens: 10 },
    }));
  }
  return generateObjectMock;
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
    expect(resolved.modelUsed).toBe("claude-haiku-5-5"); // resolve role's default lead model
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
    expect(resolved.toolPlan[0]).toMatchObject({ tool: "events", query: "comedy", category: null });
    expect((resolved.toolPlan[0] as { dateScoped?: unknown }).dateScoped).toBeNull();
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

  it("adds the budget capability when the model recognized the topic (right research_web query) but left capabilities empty", async () => {
    // Live-tested gap: the model reliably chose this exact query for a per-day spending
    // question but repeatedly left "budget" out of capabilities across many real calls, even
    // with an explicit imperative prompt tying the two together — this deterministic backstop
    // is what actually closes the gap. See BUDGET_PHRASING in turn-resolver.ts.
    mockModel(JSON.stringify({ language: "en", intent: "activities", capabilities: [], toolPlan: [{ tool: "research_web", query: "Lisbon daily travel costs food activities transit" }] }));
    const resolved = await resolveTurn({ message: "How much should we budget per day for food and activities in Lisbon?", history: [], tripSummary: "" });
    expect(resolved.capabilities).toEqual(["budget"]);
  });

  it("does not force the budget capability onto an unrelated question", async () => {
    mockModel(JSON.stringify({ language: "en", intent: "essentials", capabilities: [] }));
    const resolved = await resolveTurn({ message: "What should we pack for Lisbon?", history: [], tripSummary: "" });
    expect(resolved.capabilities).toEqual([]);
  });

  it("does not force the budget capability onto an out-of-scope message even if it mentions 'per day'", async () => {
    mockModel(JSON.stringify({ language: "en", intent: "other", outOfScope: true, capabilities: [] }));
    const resolved = await resolveTurn({ message: "how much per day does a gym membership cost back home", history: [], tripSummary: "" });
    expect(resolved.capabilities).toEqual([]);
  });

  it("doesn't duplicate 'budget' when the model already included it", async () => {
    mockModel(JSON.stringify({ language: "en", intent: "activities", capabilities: ["budget"] }));
    const resolved = await resolveTurn({ message: "how much per day for food", history: [], tripSummary: "" });
    expect(resolved.capabilities).toEqual(["budget"]);
  });

  it("retries once on an unparseable first response, then succeeds", async () => {
    const mock = mockModelSequence("garbage no json", JSON.stringify({ language: "en", intent: "food", toolPlan: [] }));
    const resolved = await resolveTurn({ message: "food", history: [], tripSummary: "" });
    expect(mock).toHaveBeenCalledTimes(2);
    expect(resolved.intent).toBe("food");
    expect(resolved.degraded).toBeUndefined(); // not the safe-default path
  });

  it("passes viewContext into the prompt so 'there' resolves to the open panel", async () => {
    const mock = mockModelSequence(JSON.stringify({ language: "en", intent: "transport", toolPlan: [] }));
    await resolveTurn({ message: "how do I get there?", history: [], tripSummary: "trip: Lisbon", viewContext: "Hotel Memmo Alfama" });
    const call = mock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMsg = call.messages.find((m) => m.role === "user")!.content;
    expect(userMsg).toContain("Hotel Memmo Alfama");
    expect(userMsg).toMatch(/there.*this place.*it/i);
  });
});

describe("routePracticalFacts", () => {
  const essentials = resolvedTurnSchema.parse({ intent: "essentials", toolPlan: [{ tool: "weather", location: "Montreal" }] });
  it("turns a practical-facts question into the fact-list answer, without the weather call", () => {
    const out = routePracticalFacts("what should I know about plugs, currency and tipping in Canada?", essentials);
    expect(out.intent).toBe("other");
    expect(out.capabilities).toContain("structured_answer");
    expect(out.toolPlan.map((c) => c.tool)).toEqual(["research_web", "research_web", "research_web"]);
    expect(out.toolPlan.map((c) => (c as { query: string }).query.toLowerCase()).join(" | ")).toMatch(/plug.*\|.*currency.*\|.*tipping/);
  });
  it("leaves a packing question on the checklist", () => {
    expect(routePracticalFacts("what should I pack, and do I need a plug adapter?", essentials)).toBe(essentials);
  });
  it("leaves other intents alone", () => {
    const food = resolvedTurnSchema.parse({ intent: "food" });
    expect(routePracticalFacts("tipping at restaurants?", food)).toBe(food);
  });
});

describe("guardRepeatedClarify", () => {
  const asked = [
    { role: "user" as const, content: "can u find resrots in tulum mexico no price issue but good quality" },
    { role: "assistant" as const, content: "What check-in and check-out dates would you like for the resort stay?" },
  ];
  const clarifying = (question: string) => resolvedTurnSchema.parse({ intent: "discovery", locationFocus: "Tulum, Mexico", clarify: { question, chips: ["This month", "Next month"] } });

  it("turns a dodged answer into a stays search instead of the same question again", () => {
    const out = guardRepeatedClarify("I'm not sure yet", asked, clarifying("What are your check-in and check-out dates for the Tulum resort stay?"));
    expect(out.clarify).toBeNull();
    expect(out.intent).toBe("stays");
    expect(out.toolPlan).toEqual([{ tool: "stays", location: "Tulum, Mexico", checkin: null, checkout: null, hotelName: null }]);
  });

  it("treats \"just show me\" and \"flexible dates\" the same way", () => {
    for (const reply of ["Flexible dates", "jsut show mw resorts".replace("jsut", "just")]) {
      expect(guardRepeatedClarify(reply, asked, clarifying("What dates are you thinking about?")).clarify).toBeNull();
    }
  });

  it("drops a repeated question even when the reply is not a dodge", () => {
    const out = guardRepeatedClarify("in tulum", asked, clarifying("Which check-in date works for you?"));
    expect(out.clarify).toBeNull();
    expect(out.toolPlan.map((c) => c.tool)).toEqual(["stays"]);
  });

  it("leaves a first question, and a different question after a real answer, alone", () => {
    const first = clarifying("What dates are you thinking about?");
    expect(guardRepeatedClarify("find resorts in tulum", [], first)).toBe(first);
    const different = clarifying("Do you want a quiet beach or a lively one?");
    expect(guardRepeatedClarify("Nov 15 to 20", asked, different)).toBe(different);
  });

  it("does not invent a stays call when the conversation was not about lodging", () => {
    const history = [{ role: "assistant" as const, content: "What pace would you like: relaxed or packed?" }];
    const out = guardRepeatedClarify("not sure", history, clarifying("Is a relaxed or a packed pace better for you?"));
    expect(out.clarify).toBeNull();
    expect(out.toolPlan).toEqual([]);
  });
});
