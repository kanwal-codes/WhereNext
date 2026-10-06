import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// after() needs Next's own request-scope AsyncLocalStorage, which doesn't exist when a test
// calls the route handler directly (not through Next's actual server) — run the callback
// immediately instead.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => { void cb(); },
}));

const TRIP = "11111111-1111-4111-8111-111111111111";
const KEY = "idem-1";
const PROMPT = "best nightclubs in Shanghai";

const appendSpy = vi.fn(async (_tripId: string, _userId: string, input: unknown) => ({ id: "a1", ...(input as object) }));
const insertSpy = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const upsertSpy = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const loadTripContextMock = vi.fn();
const resolveTurnMock = vi.fn();
const retrieveEvidenceMock = vi.fn();
/** `compose.text` is what the fake `streamText` yields; a test may reassign it, set `compose.error`,
 *  or set `compose.toolCall` to have the fake model invoke one of the real compose tools first. */
const { compose, streamTextMock, composeChainRef, slowStream } = vi.hoisted(() => {
  const compose: { text: string; error?: Error; toolCall?: { name: string; args: Record<string, unknown> }; failFirstN: number } = { text: "Here are some verified clubs.", failFirstN: 0 };
  // Tests can swap in a multi-model chain to exercise the COMPOSE fallback loop.
  const composeChainRef: { models: Array<{ model: unknown; providerOptions?: unknown; modelId?: string }> } = { models: [{ model: { mock: true } }] };
  // A real `streamText` respects `abortSignal` mid-stream (a client disconnect eventually stops
  // token production) — the disconnect regression test below needs the fake to do the same, so
  // it can hold the stream open past the first chunk until the test aborts it.
  const slowStream = { active: false, firstChunkYielded: false };
  const streamTextMock = vi.fn((opts: { tools: Record<string, { execute: (a: unknown, c: unknown) => Promise<unknown> }>; abortSignal?: AbortSignal }) => ({
    textStream: (async function* () {
      if (compose.failFirstN > 0) { compose.failFirstN -= 1; throw new Error("compose model chunk failed"); }
      if (compose.error) throw compose.error;
      if (compose.toolCall) await opts.tools[compose.toolCall.name].execute(compose.toolCall.args, {});
      yield compose.text;
      if (slowStream.active) {
        slowStream.firstChunkYielded = true;
        await new Promise<never>((_, reject) => {
          if (opts.abortSignal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
          opts.abortSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      }
    })(),
    totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 20, totalTokens: 30 }),
  }));
  return { compose, streamTextMock, composeChainRef, slowStream };
});
let listRows: Array<Record<string, unknown>> = [];
let user: { id: string } | null = { id: "u1" };
let member: { trip_id: string } | null = { trip_id: TRIP };
// The trips-row conditional update (assistant-turn.ts's optimistic-concurrency check) is the
// only real `.from("trips")` call any test here reaches — loadTripContext's own is replaced
// wholesale by loadTripContextMock below. false simulates a lost race: no row matched the
// `.eq("updated_at", ...)` guard, as if another concurrent write had changed it first.
let tripsUpdateSucceeds = true;

vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: async (client: { auth: { getUser: () => Promise<{ data: { user: unknown } }> } }) => (await client.auth.getUser()).data.user,
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      q.select = chain; q.eq = chain; q.order = chain; q.limit = chain; q.is = chain; q.update = chain;
      q.maybeSingle = async () => ({ data: table === "trips" && !tripsUpdateSucceeds ? null : member });
      q.insert = insertSpy; // ai_turn_traces best-effort write
      q.upsert = upsertSpy; // trip_decisions suggestion upserts
      return q;
    },
  }),
}));
vi.mock("@/lib/application/trip-context", () => ({
  loadTripContext: loadTripContextMock,
  serializeTripContext: (context: unknown) => JSON.stringify(context),
  formatTripMemory: () => "nothing yet",
}));
vi.mock("@/lib/application/thread-summary", () => ({ refreshThreadSummary: vi.fn(async () => undefined) }));
// Phase 3.2's grounding evaluator makes a real (cheap-role) model call — stubbed here so the
// route tests stay hermetic (no real network) and unaffected by default (empty claims list is
// the same no-op the pre-3.2 code had). The real regex sanitizer still runs underneath it, so
// every existing sanitizer-adjacent behavior (link stripping, etc.) is unchanged. A test can
// override `evaluateGroundingMock` to prove the actual soften wiring works end-to-end.
const evaluateGroundingMock = vi.hoisted(() => vi.fn(async () => ({ unsupportedClaims: [] as string[] })));
vi.mock("@/lib/application/evaluator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/application/evaluator")>();
  const { sanitizeAssistantContent } = await import("@/lib/application/sanitize-assistant");
  return {
    ...actual,
    finalizeAssistantText: async (
      content: string, allowedUrls: ReadonlySet<string>, groundingText: string,
      _signal?: AbortSignal, _onUsage?: unknown, _intent?: string, onUnverified?: () => void,
    ) => {
      const sanitized = sanitizeAssistantContent(content, allowedUrls, groundingText);
      const evaluation = await evaluateGroundingMock();
      if (actual.hasUnsupportedClaim(sanitized, evaluation.unsupportedClaims)) onUnverified?.();
      return sanitized;
    },
  };
});
const buildEssentialsChecklistMock = vi.fn(async () => null as unknown);
vi.mock("@/lib/application/essentials", () => ({ buildEssentialsChecklist: buildEssentialsChecklistMock }));
const buildComparisonMock = vi.fn(async () => null as unknown);
vi.mock("@/lib/application/comparison", () => ({ buildComparison: buildComparisonMock }));
vi.mock("@/lib/application/turn-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/application/turn-resolver")>()),
  resolveTurn: resolveTurnMock,
  MAX_TOOL_CALLS: 6,
}));
vi.mock("@/lib/application/retrieve", () => ({ retrieveEvidence: retrieveEvidenceMock }));
// Bypasses the real per-(trip, user) queue for every ordinary test (no throttling/serialization
// noise). The disconnect regression test below swaps `withTripAiStreamRef.impl` for the REAL
// implementation (via `importOriginal`) — that's the one thing this specific bug lives in.
const withTripAiStreamRef = vi.hoisted(() => ({
  impl: ((_tripId, _userId, task) => task()) as typeof import("@/lib/server/trip-ai-queue").withTripAiStream,
}));
vi.mock("@/lib/server/trip-ai-queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/trip-ai-queue")>()),
  withTripAiStream: (tripId: string, userId: string, task: () => Promise<ReadableStream<Uint8Array>>) => withTripAiStreamRef.impl(tripId, userId, task),
}));
vi.mock("@/packages/ai/compose-model", () => ({ composeModelChain: () => composeChainRef.models }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal() as object), streamText: streamTextMock }));
vi.mock("@/features/conversation/infrastructure/conversationRepository", () => ({
  createConversationRepository: () => ({ list: async () => listRows, append: appendSpy }),
  scopedMessageIdempotencyKey: (role: string, key?: string) => (key ? `${role}:${key}` : null),
}));

async function post(prompt = PROMPT, opts: { signal?: AbortSignal; idempotencyKey?: string } = {}) {
  const { POST } = await import("@/app/api/ai/route");
  const request = new Request("http://localhost/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tripId: TRIP, messages: [{ role: "user", content: prompt }], messageIdempotencyKey: opts.idempotencyKey ?? KEY }),
    signal: opts.signal,
  });
  return POST(request, { params: Promise.resolve({}) });
}

async function readMeta(response: Response) {
  const body = await new Response(response.body).text();
  const line = body.split("\n").find((l) => l.includes('"meta"'));
  return { body, meta: line ? (JSON.parse(line.slice(6)).meta as Record<string, unknown>) : undefined };
}

beforeEach(() => {
  vi.clearAllMocks();
  user = { id: "u1" };
  member = { trip_id: TRIP };
  tripsUpdateSucceeds = true;
  listRows = [{ role: "user", idempotency_key: `user:${KEY}`, content: PROMPT }];
  loadTripContextMock.mockResolvedValue({ trip: { name: "T", destination: "China", origin: null, duration_days: 8, travelers: 5 }, preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], places: [], decisions: [] });
  compose.text = "Here are some verified clubs.";
  compose.failFirstN = 0;
  composeChainRef.models = [{ model: { mock: true } }];
  delete compose.error;
  delete compose.toolCall;
  slowStream.active = false;
  slowStream.firstChunkYielded = false;
  withTripAiStreamRef.impl = (_tripId, _userId, task) => task();
  retrieveEvidenceMock.mockResolvedValue({ places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "2026-09-02T00:00:00Z" });
  resolveTurnMock.mockResolvedValue({
    language: "en", locationFocus: "Shanghai", intent: "nightlife", wantsComparison: false,
    toolPlan: [{ tool: "search_places", query: "nightclubs", location: "Shanghai" }],
    clarify: null, suggestedFollowups: [{ label: "Rooftop bars", prompt: "Show rooftop bars in Shanghai" }], proposedProfileUpdate: null,
  });
});
afterEach(() => vi.resetModules());

describe("POST /api/ai", () => {
  it("returns 401 without a user", async () => { user = null; expect((await post()).status).toBe(401); });
  it("returns 404 for a non-member", async () => { member = null; expect((await post()).status).toBe(404); });

  it("persists the user message itself, as its first action, instead of trusting a prior /conversation call", async () => {
    await post();
    expect(appendSpy).toHaveBeenCalledWith(TRIP, "u1", { role: "user", content: PROMPT, idempotencyKey: KEY });
    // It's the very first thing this route does — before RESOLVE, RETRIEVE, or COMPOSE run.
    expect(appendSpy.mock.invocationCallOrder[0]).toBeLessThan(resolveTurnMock.mock.invocationCallOrder[0]);
  });

  it("fails cleanly, without ever calling RESOLVE, when persisting the user message itself fails", async () => {
    appendSpy.mockRejectedValueOnce(new Error("db exploded"));
    const response = await post();
    expect(response.status).toBeGreaterThanOrEqual(500);
    const body = await response.json();
    expect(body.userSaved).toBeUndefined();
    expect(resolveTurnMock).not.toHaveBeenCalled();
  });

  it("does not re-suggest a trip fact that's already confirmed on the trip row", async () => {
    // Default loadTripContextMock trip already has destination/duration_days/travelers set.
    resolveTurnMock.mockResolvedValue({
      language: "en", locationFocus: "Shanghai", intent: "nightlife", wantsComparison: false,
      toolPlan: [{ tool: "search_places", query: "nightclubs", location: "Shanghai" }],
      clarify: null, suggestedFollowups: [], proposedProfileUpdate: null,
      suggestedFacts: [
        { key: "destination", display: "Lisbon", rationale: "mentioned wanting to see the Belem Tower" },
        { key: "travelers", display: "3", rationale: "asked about a table for 3" },
        { key: "trip_length", display: "About 5 days", rationale: "said they don't have long" },
      ],
    });
    const response = await post();
    expect(response.status).toBe(200);
    await new Response(response.body).text();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("discovery turn retrieves for locationFocus and emits place_list + actions", async () => {
    retrieveEvidenceMock.mockResolvedValue({
      places: [
        { provider: "google-places", providerId: "p1", name: "M1NT", category: "night_club", latitude: 31.2, longitude: 121.4, address: "Huangpu", rating: 4.3, sourceUrl: "https://maps.example/m1nt", photoNames: ["places/p1/photos/x"] },
        { provider: "google-places", providerId: "p2", name: "Bar Rouge", category: "bar", latitude: 31.2, longitude: 121.5, address: "Bund", sourceUrl: null },
      ],
      sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "2026-09-02T00:00:00Z",
    });
    const response = await post();
    expect(response.status).toBe(200);
    expect(retrieveEvidenceMock).toHaveBeenCalledWith([{ tool: "search_places", query: "nightclubs", location: "Shanghai, China" }], expect.anything(), expect.anything());
    const { meta } = await readMeta(response);
    expect(meta).toMatchObject({ locationFocus: "Shanghai", surface: "explore", language: "en" });
    expect((meta!.blocks as Array<{ type: string }>).map((b) => b.type)).toEqual(["place_list", "actions"]);
    const firstCard = (meta!.blocks as Array<{ places: Array<Record<string, unknown>> }>)[0].places[0];
    expect(firstCard).toMatchObject({ providerId: "p1", name: "M1NT", trust: "sourced" });
    expect(String(firstCard.photoUrl)).toContain("/places/google/photo?name=");
    const appendArgs = appendSpy.mock.calls.at(-1)![2] as { content: string; metadata: { blocks: unknown[] } };
    expect(appendArgs.metadata.blocks).toHaveLength(2);
    expect(appendArgs.content).toContain("verified clubs");
  });

  describe("progress frames (Phase 2.6.2)", () => {
    it("streams resolve -> retrieve -> compose progress frames in order for a full turn", async () => {
      retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
      const { body } = await readMeta(await post());
      const stages = [...body.matchAll(/"progress":"(\w+)"/g)].map((m) => m[1]);
      expect(stages).toEqual(["resolve", "retrieve", "compose"]);
    });

    it("names what's actually being looked up on the retrieve frame instead of a generic label", async () => {
      // Default mock plan is one search_places call (see beforeEach above).
      const { body } = await readMeta(await post());
      expect(body).toContain('"progress":"retrieve","label":"finding places"');
    });

    it("combines two tools' labels and caps a multi-topic plan at two, dropping the rest", async () => {
      resolveTurnMock.mockResolvedValue({
        language: "en", locationFocus: "Lisbon", intent: "transport", wantsComparison: false,
        toolPlan: [
          { tool: "directions", from: "A", to: "B", mode: "transit" },
          { tool: "weather", location: "Lisbon" },
          { tool: "search_places", query: "sights", location: "Lisbon" },
        ],
        clarify: null, suggestedFollowups: [], proposedProfileUpdate: null,
      });
      const { body } = await readMeta(await post());
      expect(body).toContain('"progress":"retrieve","label":"plotting the route and checking the forecast"');
      // The third planned tool (finding places) is dropped: two named activities at most.
      expect(body).not.toContain("finding places");
    });

    it("falls back to no label when RESOLVE planned no tools the map recognizes", async () => {
      resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Shanghai", intent: "trip_memory", wantsComparison: false, toolPlan: [], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
      const { body } = await readMeta(await post());
      expect(body).toContain('"progress":"retrieve"}');
      expect(body).not.toContain('"progress":"retrieve","label"');
    });

    it("stops at resolve — never emits retrieve or compose — for a declined (out-of-scope) turn", async () => {
      resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Shanghai", intent: "other", outOfScope: true, capabilities: [], toolPlan: [], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
      const { body } = await readMeta(await post());
      const stages = [...body.matchAll(/"progress":"(\w+)"/g)].map((m) => m[1]);
      expect(stages).toEqual(["resolve"]);
    });

    it("stops at resolve for a clarify turn too", async () => {
      resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Shanghai", intent: "other", wantsComparison: false, toolPlan: [], clarify: { question: "How many nights?", chips: [] }, suggestedFollowups: [], proposedProfileUpdate: null });
      const { body } = await readMeta(await post());
      const stages = [...body.matchAll(/"progress":"(\w+)"/g)].map((m) => m[1]);
      expect(stages).toEqual(["resolve"]);
    });

    it("reaches retrieve but never compose for an ungrounded turn (nothing came back from RETRIEVE)", async () => {
      const { body } = await readMeta(await post());
      const stages = [...body.matchAll(/"progress":"(\w+)"/g)].map((m) => m[1]);
      expect(stages).toEqual(["resolve", "retrieve"]);
    });

    it("never emits a retrieve frame for a trivial turn (Phase 2.5) — RESOLVE/RETRIEVE/COMPOSE's model are all skipped, a canned reply answers it", async () => {
      const { body } = await readMeta(await post("hi"));
      expect(resolveTurnMock).not.toHaveBeenCalled();
      expect(retrieveEvidenceMock).not.toHaveBeenCalled();
      const stages = [...body.matchAll(/"progress":"(\w+)"/g)].map((m) => m[1]);
      expect(stages).toEqual(["resolve", "compose"]);
      // The compose progress frame still fires (client UX is unchanged) but the composeSkipLine
      // short-circuit answers before ever calling the model — no real generation cost for "hi".
      expect(streamTextMock).not.toHaveBeenCalled();
      expect(body).toContain("Happy to help");
    });
  });

  it("keeps place cards for a food request that also mentions a named event, since intent isn't 'events'", async () => {
    resolveTurnMock.mockResolvedValue({
      language: "en", locationFocus: "Shanghai", intent: "food", wantsComparison: false,
      toolPlan: [
        { tool: "search_places", query: "restaurants", location: "Shanghai" },
        { tool: "events", query: "", location: "Shanghai", artist: "Bruno Mars" },
      ],
      clarify: null, suggestedFollowups: [], proposedProfileUpdate: null,
    });
    retrieveEvidenceMock.mockResolvedValue({
      places: [{ provider: "google-places", providerId: "p1", name: "Fu 1088", category: "restaurant", latitude: 31.2, longitude: 121.4, address: "Jing'an", sourceUrl: null }],
      sources: [], weather: null, routes: [],
      events: [{ title: "Bruno Mars", url: "https://tm.example/bm", source: "ticketmaster" }],
      flights: [], stays: [], unavailableProviders: [], retrievedAt: "2026-09-02T00:00:00Z",
    });
    const response = await post();
    const { meta } = await readMeta(response);
    const types = (meta!.blocks as Array<{ type: string }>).map((b) => b.type);
    expect(types).toContain("place_list");
    expect(types).toContain("events");
  });

  it("photo requests always include a places lookup", async () => {
    const prompt = "Show me photos of Notre-Dame Basilica in Montreal";
    listRows = [{ role: "user", idempotency_key: `user:${KEY}`, content: prompt }];
    resolveTurnMock.mockResolvedValue({
      language: "en", locationFocus: "Montreal", intent: "history_culture", capabilities: [],
      toolPlan: [{ tool: "research_web", query: "Notre-Dame Basilica Montreal photos" }],
      clarify: null, suggestedFollowups: [], proposedProfileUpdate: null,
    });
    retrieveEvidenceMock.mockResolvedValue({
      places: [{ provider: "google-places", providerId: "p1", name: "Notre-Dame Basilica", category: "church", latitude: 45.5, longitude: -73.5, address: "Montreal", sourceUrl: "https://maps.example/notre-dame", photoNames: ["places/p1/photos/x"] }],
      sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "2026-09-02T00:00:00Z",
    });

    const response = await post(prompt);

    expect(retrieveEvidenceMock.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ tool: "search_places", query: prompt }),
      { tool: "research_web", query: "Notre-Dame Basilica Montreal photos" },
    ]));
    const { meta } = await readMeta(response);
    const firstCard = (meta!.blocks as Array<{ places?: Array<Record<string, unknown>> }>).find((block) => block.places)?.places?.[0];
    expect(String(firstCard?.photoUrl)).toContain("/places/google/photo?name=");
  });

  it("out-of-scope turn declines in one line, with no retrieve and no compose", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Shanghai", intent: "other", outOfScope: true, capabilities: [], toolPlan: [], clarify: null, suggestedFollowups: [{ label: "x", prompt: "y" }], proposedProfileUpdate: null });
    const response = await post();
    expect(retrieveEvidenceMock).not.toHaveBeenCalled();
    expect(streamTextMock).not.toHaveBeenCalled();
    const { body, meta } = await readMeta(response);
    expect(body.toLowerCase()).toContain("can't help with that");
    expect(meta!.blocks).toEqual([]);
    expect(meta!.suggestedFollowups).toEqual([]);
  });

  it("clarify turn streams the question and does not retrieve", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Shanghai", intent: "other", wantsComparison: false, toolPlan: [], clarify: { question: "How many nights?", chips: ["2", "3-4"] }, suggestedFollowups: [], proposedProfileUpdate: null });
    const response = await post();
    expect(retrieveEvidenceMock).not.toHaveBeenCalled();
    const { body, meta } = await readMeta(response);
    expect(body).toContain("How many nights?");
    expect((meta!.blocks as Array<{ type: string; chips: string[] }>)[0]).toMatchObject({ type: "clarifying_question", chips: ["2", "3-4"] });
  });

  it("falls back cleanly when a tool plan returns nothing", async () => {
    const response = await post();
    const { body } = await readMeta(response);
    expect(body).toContain("couldn't verify");
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("retries retrieval with a broadened plan when the first pass is empty", async () => {
    retrieveEvidenceMock
      .mockResolvedValueOnce({ places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" })
      .mockResolvedValueOnce({ places: [{ provider: "g", providerId: "p", name: "Fallback Club", category: "night_club", latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const response = await post();
    expect(response.status).toBe(200);
    // Phase 2.6.2: the route now returns the Response before RESOLVE/RETRIEVE/COMPOSE finish
    // (so it can stream real progress frames) — assertions on what the turn actually did must
    // wait for the stream to fully drain, not run immediately after `post()` resolves.
    const { meta } = await readMeta(response);
    expect(retrieveEvidenceMock).toHaveBeenCalledTimes(2);
    // Second call: generic term for the nightlife intent, trip destination as the location.
    expect(retrieveEvidenceMock.mock.calls[1][0]).toEqual([{ tool: "search_places", query: "bars", location: "China" }]);
    expect(streamTextMock).toHaveBeenCalled();
    expect((meta!.blocks as Array<{ type: string }>).map((b) => b.type)).toContain("place_list");
  });

  it("adds a model-built comparison block when the user asks to compare", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Japan", intent: "discovery", capabilities: ["comparison"], toolPlan: [{ tool: "research_web", query: "Kyoto vs Kanazawa" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({ places: [], sources: [{ title: "Guide", url: "https://g.example", content: "x" }], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    buildComparisonMock.mockResolvedValue({ type: "comparison", title: "Kyoto vs Kanazawa", columns: ["Option", "Quiet", "Food"], rows: [{ label: "Kyoto", cells: ["Kyoto", "medium", "excellent"] }, { label: "Kanazawa", cells: ["Kanazawa", "high", "very good"] }], bestForYou: { label: "Kanazawa", reason: "quieter for a couple who dislike crowds" } });
    const { meta } = await readMeta(await post());
    expect(buildComparisonMock).toHaveBeenCalled();
    const cmp = (meta!.blocks as Array<Record<string, unknown>>).find((b) => b.type === "comparison");
    expect(cmp).toMatchObject({ title: "Kyoto vs Kanazawa" });
    expect((cmp as { rows: Array<{ label: string }> }).rows.map((r) => r.label)).toEqual(["Kyoto", "Kanazawa"]);
  });

  it("adds an essentials checklist block for an essentials-intent turn", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Lisbon", intent: "essentials", wantsComparison: false, toolPlan: [{ tool: "weather", location: "Lisbon" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({ places: [], sources: [], weather: "12-17C, rain", routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    buildEssentialsChecklistMock.mockResolvedValue({ type: "checklist", groups: [{ title: "Packing", items: [{ text: "Rain shell" }] }] });
    const { meta } = await readMeta(await post());
    expect(buildEssentialsChecklistMock).toHaveBeenCalled();
    expect((meta!.blocks as Array<{ type: string }>).some((b) => b.type === "checklist")).toBe(true);
    expect(meta).toMatchObject({ surface: "essentials" });
  });

  it("emits a route_summary block from directions evidence", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Lisbon", intent: "transport", wantsComparison: false, toolPlan: [{ tool: "directions", from: "A", to: "B", mode: "transit" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({ places: [], sources: [], weather: null, routes: [{ from: "A", to: "B", mode: "transit", distanceMeters: 3400, durationSeconds: 900, steps: ["metro Blue → B (12 min)"] }], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "2026-09-02T00:00:00Z" });
    const { meta } = await readMeta(await post());
    expect(meta).toMatchObject({ surface: "transport" });
    const route = (meta!.blocks as Array<Record<string, unknown>>).find((b) => b.type === "route_summary");
    expect(route).toMatchObject({ from: "A", to: "B", mode: "transit", durationSeconds: 900, distanceMeters: 3400 });
  });

  it("emits a flights block from duffel evidence", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "London", intent: "transport", wantsComparison: false, toolPlan: [{ tool: "flights", origin: "Toronto", destination: "London" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({
      places: [], sources: [], weather: null, routes: [], events: [], stays: [],
      flights: [{ origin: "Toronto", destination: "London", departureDate: "2026-10-13", assumedDate: true, offers: [
        { airline: "Air Canada", priceAmount: "812.40", priceCurrency: "CAD", durationMinutes: 491, stops: 0, departAt: "2026-10-13T18:20:00", arriveAt: "2026-10-14T06:31:00" },
      ] }],
      unavailableProviders: [], retrievedAt: "2026-09-02T00:00:00Z",
    });
    const { meta } = await readMeta(await post());
    const flights = (meta!.blocks as Array<Record<string, unknown>>).find((b) => b.type === "flights");
    expect(flights).toMatchObject({ origin: "Toronto", destination: "London" });
    expect((flights!.items as Array<Record<string, unknown>>)[0]).toMatchObject({ airline: "Air Canada", price: "812.40", currency: "CAD", stops: 0 });
    expect(String(flights!.dateNote)).toMatch(/Example date/);
  });

  it("emits a stays block from LiteAPI evidence", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Lisbon", intent: "stays", wantsComparison: false, toolPlan: [{ tool: "stays", location: "Lisbon" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({
      places: [], sources: [], weather: null, routes: [], events: [], flights: [],
      stays: [{ location: "Lisbon", checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, assumedDates: true, options: [
        { hotelId: "h1", name: "Hotel Alfama", address: "Alfama", city: "Lisbon", latitude: 38.71, longitude: -9.13, stars: 4, rating: 8.6, reviewCount: 900, thumbnail: "https://img/h1.jpg", nightlyAmount: 120, totalAmount: 360, currency: "EUR", boardName: "Breakfast", refundable: true, rooms: [] },
      ], detail: { hotelName: "Hotel Alfama", rooms: [{ name: "Deluxe", boardName: "Breakfast", refundable: true, cancelBefore: null, maxOccupancy: 2, nightlyAmount: 120, totalAmount: 360, taxesAndFees: null, currency: "EUR" }] } }],
      unavailableProviders: ["duffel"], retrievedAt: "2026-09-02T00:00:00Z",
    });
    const { meta } = await readMeta(await post());
    expect(meta).toMatchObject({ surface: "stay", unavailableProviders: ["duffel"] });
    const stays = (meta!.blocks as Array<Record<string, unknown>>).find((b) => b.type === "stays");
    expect(stays).toMatchObject({ location: "Lisbon", nights: 3, detailHotel: "Hotel Alfama" });
    const item = (stays!.items as Array<Record<string, unknown>>)[0];
    expect(item).toMatchObject({ hotelId: "h1", name: "Hotel Alfama", nightlyPrice: "120", currency: "EUR", refundable: true, latitude: 38.71, longitude: -9.13, city: "Lisbon", thumbnailUrl: "https://img/h1.jpg" });
    expect(item).not.toHaveProperty("mapUrl");
    expect((stays!.rooms as Array<Record<string, unknown>>)[0]).toMatchObject({ name: "Deluxe", nightlyAmount: 120, totalAmount: 360, maxOccupancy: 2 });
    expect(String(stays!.dateNote)).toMatch(/Example dates/);
  });

  it("tells the model to reason about hotels rather than re-list the cards", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Lisbon", intent: "stays", wantsComparison: false, toolPlan: [{ tool: "stays", location: "Lisbon" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({
      places: [], sources: [], weather: null, routes: [], events: [], flights: [],
      stays: [{ location: "Lisbon", checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, assumedDates: true, options: [
        { hotelId: "h1", name: "Hotel Alfama", address: null, city: "Lisbon", latitude: 38.71, longitude: -9.13, stars: 4, rating: 8.6, reviewCount: 900, thumbnail: null, nightlyAmount: 120, totalAmount: 360, currency: "EUR", boardName: null, refundable: true, rooms: [] },
      ] }],
      unavailableProviders: [], retrievedAt: "t",
    });
    await readMeta(await post());
    const system = String((streamTextMock.mock.calls[0] as unknown as [{ system: string }])[0].system);
    expect(system).toMatch(/shown as cards/);
    expect(system).toMatch(/Do not list hotels or prices/);
    expect(system).toMatch(/Do not restate what the cards show/);
    // The old evidence instructions told the model to re-list what the cards already show.
    expect(system).not.toMatch(/Name 2-3 options with their nightly rate|List them by name, date, and venue|Mark live facts with a trust label/);
  });

  it("adds distance-to-locked-place on discovery cards ONLY when the traveller's own message made proximity part of the ask", async () => {
    loadTripContextMock.mockResolvedValue({ trip: { name: "T", destination: "Lisbon", origin: null, duration_days: 5, travelers: 2 }, preferences: {}, itinerary: [], lockedTitles: ["Jerónimos Monastery"], lockedPlaces: [{ title: "Jerónimos Monastery", latitude: 38.6979, longitude: -9.2064 }], places: [], decisions: [] });
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p1", name: "Belém Tower", category: "tourist_attraction", latitude: 38.6916, longitude: -9.216, address: "Belém", sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const cardFor = async () => {
      const { meta } = await readMeta(await post());
      return (meta!.blocks as Array<{ type: string; places: Array<Record<string, unknown>> }>).find((b) => b.type === "place_list")!.places[0];
    };

    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Lisbon", intent: "discovery", proximityMatters: false, wantsComparison: false, toolPlan: [{ tool: "search_places", query: "sights", location: "Lisbon" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    expect((await cardFor()).distanceToLocked).toBeUndefined(); // plain "recommend some sights" never mentioned distance

    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Lisbon", intent: "discovery", proximityMatters: true, wantsComparison: false, toolPlan: [{ tool: "search_places", query: "sights", location: "Lisbon" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    expect(String((await cardFor()).distanceToLocked)).toMatch(/from Jerónimos Monastery/);
  });

  it("measures from the locked accommodation, not another locked place, as a travel time", async () => {
    loadTripContextMock.mockResolvedValue({
      trip: { name: "T", destination: "Lisbon", origin: null, duration_days: 5, travelers: 2 },
      preferences: {}, itinerary: [], lockedTitles: ["Jerónimos Monastery"],
      // The monastery is geographically CLOSER to the returned place than the hotel is — a plain
      // nearest-of-all-locked-things rule would pick it. The hotel should win anyway.
      lockedPlaces: [{ title: "Jerónimos Monastery", latitude: 38.6979, longitude: -9.2064 }],
      accommodationAnchor: { title: "Hotel Alfama", latitude: 38.7, longitude: -9.13 },
      places: [], decisions: [],
    });
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Lisbon", intent: "discovery", proximityMatters: true, wantsComparison: false, toolPlan: [{ tool: "search_places", query: "sights", location: "Lisbon" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p1", name: "Belém Tower", category: "tourist_attraction", latitude: 38.6916, longitude: -9.216, address: "Belém", sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const { meta } = await readMeta(await post());
    const card = (meta!.blocks as Array<{ type: string; places: Array<Record<string, unknown>> }>).find((b) => b.type === "place_list")!.places[0];
    // ~5 km from the hotel (transit); the monastery is under 1 km away and would have read as a walk.
    expect(String(card.distanceToLocked)).toMatch(/^\d+ min transit$/);
  });

  it("shows the time from the accommodation even when the traveller did not ask about distance", async () => {
    loadTripContextMock.mockResolvedValue({
      trip: { name: "T", destination: "Lisbon", origin: null, duration_days: 5, travelers: 2 },
      preferences: {}, itinerary: [], lockedTitles: ["Jerónimos Monastery"],
      // The monastery is geographically CLOSER to the returned place than the hotel is — a plain
      // nearest-of-all-locked-things rule would pick it. The hotel should win anyway.
      lockedPlaces: [{ title: "Jerónimos Monastery", latitude: 38.6979, longitude: -9.2064 }],
      accommodationAnchor: { title: "Hotel Alfama", latitude: 38.7, longitude: -9.13 },
      places: [], decisions: [],
    });
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Lisbon", intent: "discovery", proximityMatters: false, wantsComparison: false, toolPlan: [{ tool: "search_places", query: "sights", location: "Lisbon" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p1", name: "Belém Tower", category: "tourist_attraction", latitude: 38.6916, longitude: -9.216, address: "Belém", sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const { meta } = await readMeta(await post());
    const card = (meta!.blocks as Array<{ type: string; places: Array<Record<string, unknown>> }>).find((b) => b.type === "place_list")!.places[0];
    expect(String(card.distanceToLocked)).toMatch(/^\d+ min (walk|transit|drive)$/);
  });

  it("without an accommodation, shows a distance from a locked place only when it is close", async () => {
    loadTripContextMock.mockResolvedValue({
      trip: { name: "T", destination: "Lisbon", origin: null, duration_days: 5, travelers: 2 },
      preferences: {}, itinerary: [], lockedTitles: ["Jerónimos Monastery"],
      // The monastery is geographically CLOSER to the returned place than the hotel is — a plain
      // nearest-of-all-locked-things rule would pick it. The hotel should win anyway.
      lockedPlaces: [{ title: "Jerónimos Monastery", latitude: 38.55, longitude: -9.0 }],
      accommodationAnchor: null,
      places: [], decisions: [],
    });
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Lisbon", intent: "discovery", proximityMatters: true, wantsComparison: false, toolPlan: [{ tool: "search_places", query: "sights", location: "Lisbon" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p1", name: "Belém Tower", category: "tourist_attraction", latitude: 38.6916, longitude: -9.216, address: "Belém", sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const { meta } = await readMeta(await post());
    const card = (meta!.blocks as Array<{ type: string; places: Array<Record<string, unknown>> }>).find((b) => b.type === "place_list")!.places[0];
    expect(card.distanceToLocked).toBeUndefined();
  });

  it("passes the trip's stored dislikes into retrieval", async () => {
    loadTripContextMock.mockResolvedValue({ trip: { name: "T", destination: "China", origin: null, duration_days: 8, travelers: 5 }, preferences: { dislikes: ["museums"] }, itinerary: [], lockedTitles: [], lockedPlaces: [], places: [], decisions: [] });
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "Club", category: "night_club", latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    await post();
    expect(retrieveEvidenceMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dislikes: ["museums"], currency: "CAD" }), expect.anything());
  });

  it("annotates the most recent assistant turn's suggested next steps into RESOLVE's history, so a short referential reply can be matched (live-testing regression, 2026-09-16)", async () => {
    // Found live: "book it", sent right after a "Book the tour in advance?" suggestion, resolved
    // to a generic "activities" intent instead of the specific suggestion — because the history
    // RESOLVE receives dropped `suggestedFollowups` metadata entirely, keeping only {role, content}.
    listRows = [
      { role: "user", idempotency_key: "user:earlier", content: "any bike tours?" },
      {
        role: "assistant", idempotency_key: "assistant:earlier", content: "Fitz runs a mural bike tour.",
        metadata: { suggestedFollowups: [{ label: "Book the tour in advance?", prompt: "Do we need to pre-book tickets for the Fitz Montréal Bike Tour?" }] },
      },
      { role: "user", idempotency_key: `user:${KEY}`, content: PROMPT },
    ];
    await post();
    const call = resolveTurnMock.mock.calls.at(-1)![0] as { history: Array<{ role: string; content: string }> };
    const lastAssistantTurn = call.history.filter((m) => m.role === "assistant").at(-1);
    expect(lastAssistantTurn?.content).toContain("Fitz runs a mural bike tour.");
    expect(lastAssistantTurn?.content).toContain("Book the tour in advance?");
    expect(lastAssistantTurn?.content).toContain("Do we need to pre-book tickets for the Fitz Montréal Bike Tour?");
  });

  it("does not annotate an assistant turn with no suggested next steps", async () => {
    listRows = [
      { role: "assistant", idempotency_key: "assistant:earlier", content: "Here's the weather.", metadata: {} },
      { role: "user", idempotency_key: `user:${KEY}`, content: PROMPT },
    ];
    await post();
    const call = resolveTurnMock.mock.calls.at(-1)![0] as { history: Array<{ role: string; content: string }> };
    const lastAssistantTurn = call.history.filter((m) => m.role === "assistant").at(-1);
    expect(lastAssistantTurn?.content).toBe("Here's the weather.");
  });

  it("excludes rejected trip places from retrieval and warns COMPOSE off already-shown cards", async () => {
    loadTripContextMock.mockResolvedValue({
      trip: { name: "T", destination: "China", origin: null, duration_days: 8, travelers: 5 },
      preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [],
      places: [{ status: "rejected", place: { name: "Bar Rouge", category: "bar", address: null } }],
      decisions: [],
    });
    listRows = [
      { role: "user", idempotency_key: `user:${KEY}`, content: PROMPT },
      { role: "assistant", idempotency_key: "assistant:prev", content: "earlier", metadata: { blocks: [{ type: "place_list", places: [{ name: "M1NT" }, { name: "Speak Low" }] }] } },
    ];
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "New Club", category: "night_club", latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    await readMeta(await post());
    expect(retrieveEvidenceMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ excludeNames: ["Bar Rouge"] }), expect.anything());
    const system = String((streamTextMock.mock.calls[0] as unknown as [{ system: string }])[0].system);
    expect(system).toMatch(/Already shown as cards earlier in this conversation: M1NT, Speak Low/);
  });

  it("threads viewContext (an open panel) into RESOLVE and COMPOSE", async () => {
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const { POST } = await import("@/app/api/ai/route");
    const request = new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tripId: TRIP, messages: [{ role: "user", content: PROMPT }], messageIdempotencyKey: KEY, viewContext: "Hotel Alfama" }),
    });
    await new Response((await POST(request, { params: Promise.resolve({}) })).body).text();
    expect(resolveTurnMock).toHaveBeenCalledWith(expect.objectContaining({ viewContext: "Hotel Alfama" }));
    const system = String((streamTextMock.mock.calls[0] as unknown as [{ system: string }])[0].system);
    expect(system).toMatch(/has this open beside the chat: Hotel Alfama/);
  });

  it("runs a tool the model calls during COMPOSE and records it in the turn trace", async () => {
    // First retrieve = RESOLVE's base plan (a place); second = the model's directions follow-up.
    retrieveEvidenceMock
      .mockResolvedValueOnce({ places: [{ provider: "g", providerId: "p", name: "M1NT", category: "night_club", latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" })
      .mockResolvedValueOnce({ places: [], sources: [], weather: null, routes: [{ from: "A", to: "B", mode: "transit", distanceMeters: 2000, durationSeconds: 600, steps: [] }], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    compose.toolCall = { name: "directions", args: { from: "M1NT", to: "hotel", mode: "transit" } };

    const response = await post();
    expect(response.status).toBe(200);
    await readMeta(response); // consume the stream so persist + trace run
    expect(retrieveEvidenceMock).toHaveBeenCalledTimes(2);
    expect((retrieveEvidenceMock.mock.calls as unknown as unknown[][])[1][0]).toEqual([{ tool: "directions", from: "M1NT, China", to: "hotel, China", mode: "transit" }]);
    const traceRow = (insertSpy.mock.calls.at(-1) as unknown as unknown[] | undefined)?.[0] as { tools: string[] } | undefined;
    expect(traceRow?.tools).toEqual(expect.arrayContaining(["search_places", "directions"]));
  });

  it("carries the trip window + per-event offsets on the events block and briefs COMPOSE on the near-miss", async () => {
    loadTripContextMock.mockResolvedValue({ trip: { name: "T", destination: "Montreal", origin: null, duration_days: 6, travelers: 2, start_date: "2026-10-26", end_date: "2026-11-01" }, preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], places: [], decisions: [] });
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Montreal", intent: "events", wantsComparison: false, toolPlan: [{ tool: "events", query: "concerts", location: "Montreal" }, { tool: "research_web", query: "montreal concerts" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({
      places: [], sources: [], weather: null, routes: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t",
      events: [{ title: "Just After", url: "https://tm/x", date: "2026-11-04", venue: "Bell", source: "ticketmaster", startDate: "2026-11-04", relToTrip: "after", offsetDays: 3 }],
    });
    const { meta } = await readMeta(await post());
    const block = (meta!.blocks as Array<Record<string, unknown>>).find((b) => b.type === "events")!;
    expect(block.window).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect((block.items as Array<Record<string, unknown>>)[0]).toMatchObject({ relToTrip: "after", offsetDays: 3 });
    const system = String((streamTextMock.mock.calls[0] as unknown as [{ system: string }])[0].system);
    expect(system).toMatch(/NONE fall in the trip window\. Lead with the closest: "Just After"/);
  });

  it("offers the dates as pickable chips when a named act plays multiple nights during the trip", async () => {
    loadTripContextMock.mockResolvedValue({ trip: { name: "T", destination: "Montreal", origin: null, duration_days: 6, travelers: 2, start_date: "2026-10-26", end_date: "2026-11-01" }, preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], places: [], decisions: [] });
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Montreal", intent: "events", wantsComparison: false, toolPlan: [{ tool: "events", query: "is Bruno Mars playing", location: "Montreal", artist: "Bruno Mars" }, { tool: "research_web", query: "bruno mars montreal" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({
      places: [], sources: [], weather: null, routes: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t",
      events: [
        { title: "Bruno Mars", url: "https://tm/a", date: "2026-10-29", venue: "Bell", source: "ticketmaster", startDate: "2026-10-29", relToTrip: "in", offsetDays: 0 },
        { title: "Bruno Mars", url: "https://tm/b", date: "2026-10-31", venue: "Bell", source: "ticketmaster", startDate: "2026-10-31", relToTrip: "in", offsetDays: 0 },
      ],
    });
    const { meta } = await readMeta(await post());
    const chipBlock = (meta!.blocks as Array<{ type: string; question?: string; chips?: string[] }>).find((b) => b.type === "clarifying_question");
    expect(chipBlock?.question).toBe("Which Bruno Mars night?");
    expect(chipBlock?.chips).toEqual(["Bruno Mars · 2026-10-29", "Bruno Mars · 2026-10-31"]);
  });

  it("does not leak reasoning-model scratchpad into the streamed or persisted reply", async () => {
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "Bar Rouge", category: "bar", latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    compose.text = "<|channel|>analysis<|message|>The user wants nightlife. No hotel yet — but do not ask.<|end|><|start|>assistant<|channel|>final<|message|>Bar Rouge is the pick for a Bund view.<|return|>";
    const response = await post();
    const { body } = await readMeta(response);
    expect(body).not.toContain("analysis");
    expect(body).not.toContain("do not ask");
    expect(body).toContain("Bar Rouge is the pick");
    const appendArgs = appendSpy.mock.calls.at(-1)![2] as { content: string };
    expect(appendArgs.content).toBe("Bar Rouge is the pick for a Bund view.");
  });

  it("turns a proposedProfileUpdate into an update_preferences command", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Shanghai", intent: "nightlife", wantsComparison: false, toolPlan: [], clarify: null, suggestedFollowups: [], proposedProfileUpdate: { budget: 120 } });
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const response = await post();
    const { meta } = await readMeta(response);
    expect(meta!.proposedCommand).toMatchObject({ type: "update_preferences", tripId: TRIP, preferences: { budget: 120 } });
  });

  it("shows a visible, undoable receipt when an explicit trip-fact change is applied", async () => {
    loadTripContextMock
      .mockResolvedValueOnce({ trip: { name: "T", destination: "China", origin: null, duration_days: 8, travelers: 5, updated_at: "2026-01-01T00:00:00Z" }, preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], places: [], decisions: [] })
      .mockResolvedValueOnce({ trip: { name: "T", destination: "Osaka", origin: null, duration_days: 8, travelers: 5, updated_at: "2026-01-01T00:05:00Z" }, preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], places: [], decisions: [] });
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Osaka", intent: "trip_memory", capabilities: [], toolPlan: [], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null, proposedTripUpdate: { destination: "Osaka" } });
    const response = await post("actually we're going to Osaka instead");
    const { meta } = await readMeta(response);
    const receipt = (meta!.blocks as Array<Record<string, unknown>>).find((b) => b.type === "trip_update");
    expect(receipt).toBeTruthy();
    const changes = receipt!.changes as Array<Record<string, unknown>>;
    expect(changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: "destination", from: "China", to: "Osaka", undoPrompt: expect.stringContaining("China") })]));
  });

  it("does not apply a trip-fact change, and reloads the current trip instead, when the row changed since this turn loaded it", async () => {
    tripsUpdateSucceeds = false; // simulates a lost race — no row matched the updated_at guard
    loadTripContextMock
      .mockResolvedValueOnce({ trip: { name: "T", destination: "China", origin: null, duration_days: 8, travelers: 5, updated_at: "2026-01-01T00:00:00Z" }, preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], places: [], decisions: [] })
      // The reload after a lost race sees whatever another concurrent write actually landed —
      // simulated here as a third destination, distinct from both this turn's stale read and
      // its own (rejected) proposal, so the assertion can't pass by accident.
      .mockResolvedValueOnce({ trip: { name: "T", destination: "Seoul", origin: null, duration_days: 8, travelers: 5, updated_at: "2026-01-01T00:09:00Z" }, preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], places: [], decisions: [] });
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Osaka", intent: "trip_memory", capabilities: [], toolPlan: [], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null, proposedTripUpdate: { destination: "Osaka" } });
    const response = await post("actually we're going to Osaka instead");
    expect(response.status).toBe(200);
    const { meta } = await readMeta(response);
    expect((meta!.blocks as Array<Record<string, unknown>>).some((b) => b.type === "trip_update")).toBe(false);
    expect(loadTripContextMock).toHaveBeenCalledTimes(2); // initial load + reload after the conflict
  });

  // --- adversarial / regression: the pipeline must degrade, not crash ------------------------

  it("returns 400 for a body that is not JSON at all", async () => {
    const { POST } = await import("@/app/api/ai/route");
    const request = new Request("http://localhost/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: "}{ this is not json" });
    expect((await POST(request, { params: Promise.resolve({}) })).status).toBe(400);
  });

  it("still answers 200 and flags the turn degraded when RESOLVE fell back to its safe default", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: null, intent: "other", wantsComparison: false, toolPlan: [], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null, degraded: true });
    const response = await post();
    expect(response.status).toBe(200);
    const { meta } = await readMeta(response);
    expect(meta).toMatchObject({ degraded: true });
  });

  it("degrades gracefully in-band (not a stack, not a raw 5xx) when RETRIEVE throws unexpectedly", async () => {
    // Phase 2.6.2: the Response (status 200, SSE headers) is now returned BEFORE RESOLVE/RETRIEVE
    // run, so a client sees real progress during them — there is no clean status code left to
    // fall back to if something inside fails after that point. It degrades in-band instead: a
    // plain apology as the streamed text, flagged `truncated` so it isn't replayed as a genuine
    // complete answer, never the raw internal error message.
    retrieveEvidenceMock.mockRejectedValue(new Error("provider layer exploded"));
    const response = await post();
    expect(response.status).toBe(200);
    const { body } = await readMeta(response);
    expect(body).toContain("unavailable");
    expect(body).not.toMatch(/exploded/); // internal detail not leaked to the client
  });

  it("falls over to the next model when the first model's stream throws on its first chunk", async () => {
    composeChainRef.models = [{ model: { id: "primary" } }, { model: { id: "fallback" } }];
    compose.failFirstN = 1;
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const response = await post();
    expect(response.status).toBe(200);
    const { body } = await readMeta(response);
    expect(body).toContain("verified clubs");
    expect(streamTextMock).toHaveBeenCalledTimes(2); // primary threw, fallback produced the stream
  });

  it("forwards a chain entry's providerOptions (Gateway provider pin) to streamText", async () => {
    composeChainRef.models = [{ model: { id: "primary" }, modelId: "primary-model", providerOptions: { gateway: { only: ["cerebras"] } } }];
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    await readMeta(await post());
    expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({ providerOptions: { gateway: { only: ["cerebras"] } } }));
  });

  it("does not pass a providerOptions key to streamText for an unpinned chain entry", async () => {
    composeChainRef.models = [{ model: { id: "primary" }, modelId: "primary-model" }];
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    await readMeta(await post());
    expect(streamTextMock).toHaveBeenCalledWith(expect.not.objectContaining({ providerOptions: expect.anything() }));
  });

  it("traces which model actually answered the turn, not just the configured primary", async () => {
    resolveTurnMock.mockResolvedValue({
      language: "en", locationFocus: "Shanghai", intent: "nightlife", wantsComparison: false,
      toolPlan: [{ tool: "search_places", query: "nightclubs", location: "Shanghai" }],
      clarify: null, suggestedFollowups: [], proposedProfileUpdate: null,
      modelUsed: "resolve-fallback-model",
    });
    composeChainRef.models = [{ model: { id: "primary" }, modelId: "primary-model" }, { model: { id: "fallback" }, modelId: "fallback-model" }];
    compose.failFirstN = 1;
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    await readMeta(await post());
    const traceRow = (insertSpy.mock.calls.at(-1) as unknown as unknown[] | undefined)?.[0] as { model_resolve?: string; model_compose?: string } | undefined;
    expect(traceRow?.model_resolve).toBe("resolve-fallback-model");
    expect(traceRow?.model_compose).toBe("fallback-model"); // the primary threw — this is what really answered
  });

  it("does not mislabel a degraded RESOLVE's trace with COMPOSE's model env override", async () => {
    // Regression for a real bug: the fallback used to be `RESOLVE_MODEL || AI_MODEL`, so when
    // RESOLVE fully degrades (no modelUsed) and only AI_MODEL (COMPOSE's override) is set, the
    // trace would wrongly record COMPOSE's model as the one that ran RESOLVE.
    vi.stubEnv("AI_MODEL", "compose-env-model");
    vi.stubEnv("RESOLVE_MODEL", "");
    resolveTurnMock.mockResolvedValue({
      language: "en", locationFocus: "Shanghai", intent: "nightlife", wantsComparison: false,
      toolPlan: [{ tool: "search_places", query: "nightclubs", location: "Shanghai" }],
      clarify: null, suggestedFollowups: [], proposedProfileUpdate: null,
      modelUsed: undefined, degraded: true,
    });
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    await readMeta(await post());
    const traceRow = (insertSpy.mock.calls.at(-1) as unknown as unknown[] | undefined)?.[0] as { model_resolve?: string } | undefined;
    // Asserting the exact value, not just `.not.toBe("compose-env-model")` — a prior version of
    // this test only checked the negative and missed that `?? process.env.RESOLVE_MODEL ?? undefined`
    // stores `""` (not `undefined`) when RESOLVE_MODEL is set-but-blank, since `??` doesn't treat
    // an empty string as nullish. `undefined` is what a genuinely degraded, unset-override RESOLVE
    // call must record.
    expect(traceRow?.model_resolve).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("flags (but never rewrites) a claim the grounding evaluator finds unsupported", async () => {
    // Phase 3.2.1 originally rewrote the flagged span in place with a generic hedge phrase —
    // retired after three separate live bugs where that string-substitution broke the
    // surrounding sentence's grammar in three different ways (a dropped article, preposition,
    // then linking verb). The reply is now left exactly as COMPOSE wrote it; a separate
    // `unverified` meta flag is what tells the UI to show a small caveat below it instead.
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    compose.text = "Bar Rouge has a great rooftop view, right in the heart of Montmartre.";
    evaluateGroundingMock.mockResolvedValueOnce({ unsupportedClaims: ["right in the heart of Montmartre"] });
    const response = await post();
    await readMeta(response);
    // The persisted text is what the client settles on too — the final meta frame carries this
    // same string (see streamAssistantResponse.ts: "the meta frame carries the final sanitized
    // text" — it replaces whatever was streamed live).
    const appendArgs = appendSpy.mock.calls.at(-1)![2] as { content: string; metadata: { unverified?: boolean } };
    expect(appendArgs.content).toBe("Bar Rouge has a great rooftop view, right in the heart of Montmartre.");
    expect(appendArgs.metadata.unverified).toBe(true);
  });

  it("leaves a genuinely clean reply completely untouched when the evaluator flags nothing", async () => {
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    compose.text = "Bar Rouge has a great rooftop view.";
    evaluateGroundingMock.mockResolvedValueOnce({ unsupportedClaims: [] });
    const response = await post();
    await readMeta(response);
    const appendArgs = appendSpy.mock.calls.at(-1)![2] as { content: string };
    expect(appendArgs.content).toBe("Bar Rouge has a great rooftop view.");
  });

  it("degrades gracefully in-band when every model in the COMPOSE chain fails", async () => {
    // Same reasoning as the RETRIEVE-throws test above — by the time every COMPOSE model has
    // failed, the 200 + SSE response is already committed, so this can't become a 5xx either.
    composeChainRef.models = [{ model: { id: "primary" } }, { model: { id: "fallback" } }];
    compose.failFirstN = 2;
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const response = await post();
    expect(response.status).toBe(200);
    const { body } = await readMeta(response);
    expect(body).toContain("unavailable");
  });

  it("streams and persists a very large model reply without truncating it", async () => {
    compose.text = `Bar Rouge is the pick. ${"padding ".repeat(30_000)}`;
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const response = await post();
    expect(response.status).toBe(200);
    await readMeta(response);
    const persisted = (appendSpy.mock.calls.at(-1)![2] as { content: string }).content;
    expect(persisted.length).toBeGreaterThan(200_000);
    expect(persisted.startsWith("Bar Rouge is the pick.")).toBe(true);
  });

  describe("client disconnect mid-COMPOSE (Phase 2.6.2 regression)", () => {
    // Uses the REAL `withTripAiStream` (not the bypass every other test in this file gets) —
    // this bug lives specifically in the interaction between the early-opened response stream
    // and the real per-(trip, user) queue's slot-release timing.
    //
    // Deliberately does NOT abort `request.signal` — that path is already handled fine today
    // (it propagates into the compose model's own `abortSignal`, which the inner stream's
    // existing catch treats as a graceful early end, closing normally and releasing the queue
    // slot with no fix needed). The actual bug is the platform cancelling the *Response stream*
    // on a real client disconnect, decoupled from `request.signal` (verified live-uncertain,
    // platform-dependent per the adversarial review) — simulated here by cancelling the
    // Response's own `body` directly, the way the platform would, while `request.signal` stays
    // untouched and the underlying fake model call is still genuinely holding the stream open.
    it("releases the queue slot when the platform cancels the response stream, even if request.signal never fires", async () => {
      const real = await vi.importActual<typeof import("@/lib/server/trip-ai-queue")>("@/lib/server/trip-ai-queue");
      withTripAiStreamRef.impl = real.withTripAiStream;
      retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });

      // First turn: the fake model holds the stream open past its first chunk (like a real
      // in-progress COMPOSE stream) and only ever stops via its own `abortSignal` listener —
      // never on its own, and never because anyone stopped reading it.
      slowStream.active = true;
      const firstResponse = await post(PROMPT, { idempotencyKey: "disconnect-req-1" });
      for (let i = 0; i < 200 && !slowStream.firstChunkYielded; i += 1) await new Promise((r) => setTimeout(r, 5));
      expect(slowStream.firstChunkYielded).toBe(true);

      // Simulate the platform cancelling the response when the client disconnects — the actual
      // mechanism (not `request.signal`, which stays untouched here on purpose).
      await firstResponse.body!.cancel();
      await new Promise((r) => setTimeout(r, 20));

      // Second turn, same trip + same user, normal (fast) stream this time. `post()` itself
      // resolves almost instantly regardless (the whole point of Phase 2.6.2 — the Response
      // commits before the turn is even planned) — the real signal is whether its BODY ever
      // finishes draining. If the first turn's queue slot leaked, `withTripAiStream`'s `await
      // previous` inside the real implementation blocks forever deep inside the second stream's
      // own `start()`, and the second response's body just never closes — race the drain against
      // a short timeout so a regression fails clearly instead of hanging the whole test run.
      slowStream.active = false;
      const secondResponse = await post(PROMPT, { idempotencyKey: "disconnect-req-2" });
      const secondResultOrTimeout = await Promise.race([
        readMeta(secondResponse).then(() => "completed" as const),
        new Promise<"timed-out">((resolve) => setTimeout(() => resolve("timed-out"), 3_000)),
      ]);
      expect(secondResultOrTimeout).toBe("completed");
    }, 10_000);

    it("actually aborts the in-flight COMPOSE model call on a platform disconnect, not just the queue slot", async () => {
      // The queue-slot test above proves the *symptom* (a leaked slot) is fixed, but that alone
      // doesn't prove the underlying provider call is stopped — it could still run to completion
      // or its own 60s deadline in the background, orphaned, still billed, just no longer blocking
      // anyone. This asserts the actual abortSignal passed to `streamText` fires on disconnect.
      const real = await vi.importActual<typeof import("@/lib/server/trip-ai-queue")>("@/lib/server/trip-ai-queue");
      withTripAiStreamRef.impl = real.withTripAiStream;
      retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });

      slowStream.active = true;
      const firstResponse = await post(PROMPT, { idempotencyKey: "disconnect-abort-req-1" });
      for (let i = 0; i < 200 && !slowStream.firstChunkYielded; i += 1) await new Promise((r) => setTimeout(r, 5));
      const { abortSignal } = streamTextMock.mock.calls.at(-1)![0] as { abortSignal?: AbortSignal };
      expect(abortSignal?.aborted).toBe(false);

      await firstResponse.body!.cancel();
      await new Promise((r) => setTimeout(r, 20));
      expect(abortSignal?.aborted).toBe(true);

      slowStream.active = false;
    }, 10_000);

    it("sanity check: a second turn genuinely blocks behind a first turn that's still holding the queue slot", async () => {
      // Proves the harness itself is real, not a false-positive pass: with NEITHER turn ever
      // disconnected, a second turn for the same (trip, user) MUST wait for the first — confirms
      // the real queue is genuinely wired into this test and would visibly block. Without this,
      // the fix-verifying test above could pass for the wrong reason (e.g. the real queue module
      // silently not being exercised at all).
      const real = await vi.importActual<typeof import("@/lib/server/trip-ai-queue")>("@/lib/server/trip-ai-queue");
      withTripAiStreamRef.impl = real.withTripAiStream;
      retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
      slowStream.active = true;
      await post(PROMPT, { idempotencyKey: "diag-req-1" });
      for (let i = 0; i < 200 && !slowStream.firstChunkYielded; i += 1) await new Promise((r) => setTimeout(r, 5));
      expect(slowStream.firstChunkYielded).toBe(true);
      // Never cancel or abort anything — the first turn's fake model is still genuinely holding
      // the stream open. A second turn for the same (trip, user) MUST block behind it.
      const secondResponse = await post(PROMPT, { idempotencyKey: "diag-req-2" });
      const secondResultOrTimeout = await Promise.race([
        readMeta(secondResponse).then(() => "completed" as const),
        new Promise<"timed-out">((resolve) => setTimeout(() => resolve("timed-out"), 1_500)),
      ]);
      expect(secondResultOrTimeout).toBe("timed-out");
    }, 10_000);
  });
});
