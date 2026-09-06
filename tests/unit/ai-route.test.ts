import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";
const KEY = "idem-1";
const PROMPT = "best nightclubs in Shanghai";

const appendSpy = vi.fn(async (_tripId: string, input: unknown) => ({ id: "a1", ...(input as object) }));
const insertSpy = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const loadTripContextMock = vi.fn();
const resolveTurnMock = vi.fn();
const retrieveEvidenceMock = vi.fn();
/** `compose.text` is what the fake `streamText` yields; a test may reassign it, set `compose.error`,
 *  or set `compose.toolCall` to have the fake model invoke one of the real compose tools first. */
const { compose, streamTextMock, composeChainRef } = vi.hoisted(() => {
  const compose: { text: string; error?: Error; toolCall?: { name: string; args: Record<string, unknown> }; failFirstN: number } = { text: "Here are some verified clubs.", failFirstN: 0 };
  // Tests can swap in a multi-model chain to exercise the COMPOSE fallback loop.
  const composeChainRef: { models: Array<{ model: unknown; providerOptions?: unknown; modelId?: string }> } = { models: [{ model: { mock: true } }] };
  const streamTextMock = vi.fn((opts: { tools: Record<string, { execute: (a: unknown, c: unknown) => Promise<unknown> }> }) => ({
    textStream: (async function* () {
      if (compose.failFirstN > 0) { compose.failFirstN -= 1; throw new Error("compose model chunk failed"); }
      if (compose.error) throw compose.error;
      if (compose.toolCall) await opts.tools[compose.toolCall.name].execute(compose.toolCall.args, {});
      yield compose.text;
    })(),
    totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 20, totalTokens: 30 }),
  }));
  return { compose, streamTextMock, composeChainRef };
});
let listRows: Array<Record<string, unknown>> = [];
let user: { id: string } | null = { id: "u1" };
let member: { trip_id: string } | null = { trip_id: TRIP };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      q.select = chain; q.eq = chain; q.order = chain; q.limit = chain; q.is = chain;
      q.maybeSingle = async () => ({ data: member });
      q.insert = insertSpy; // ai_turn_traces best-effort write
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
const buildEssentialsChecklistMock = vi.fn(async () => null as unknown);
vi.mock("@/lib/application/essentials", () => ({ buildEssentialsChecklist: buildEssentialsChecklistMock }));
const buildComparisonMock = vi.fn(async () => null as unknown);
vi.mock("@/lib/application/comparison", () => ({ buildComparison: buildComparisonMock }));
vi.mock("@/lib/application/turn-resolver", () => ({ resolveTurn: resolveTurnMock }));
vi.mock("@/lib/application/retrieve", () => ({ retrieveEvidence: retrieveEvidenceMock }));
vi.mock("@/lib/server/trip-ai-queue", () => ({ withTripAiStream: (_id: string, task: () => unknown) => task() }));
vi.mock("@/packages/ai/compose-model", () => ({ composeModelChain: () => composeChainRef.models }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal() as object), streamText: streamTextMock }));
vi.mock("@/features/conversation/infrastructure/conversationRepository", () => ({
  createConversationRepository: () => ({ list: async () => listRows, append: appendSpy }),
  scopedMessageIdempotencyKey: (role: string, key?: string) => (key ? `${role}:${key}` : null),
}));

async function post(prompt = PROMPT) {
  const { POST } = await import("@/app/api/ai/route");
  const request = new Request("http://localhost/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tripId: TRIP, messages: [{ role: "user", content: prompt }], messageIdempotencyKey: KEY }),
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
  listRows = [{ role: "user", idempotency_key: `user:${KEY}`, content: PROMPT }];
  loadTripContextMock.mockResolvedValue({ trip: { name: "T", destination: "China", origin: null, duration_days: 8, travelers: 5 }, preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], places: [], decisions: [] });
  compose.text = "Here are some verified clubs.";
  compose.failFirstN = 0;
  composeChainRef.models = [{ model: { mock: true } }];
  delete compose.error;
  delete compose.toolCall;
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
  it("returns 409 when the user message is not persisted first", async () => { listRows = []; expect((await post()).status).toBe(409); });

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
    const appendArgs = appendSpy.mock.calls.at(-1)![1] as { content: string; metadata: { blocks: unknown[] } };
    expect(appendArgs.metadata.blocks).toHaveLength(2);
    expect(appendArgs.content).toContain("verified clubs");
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
    expect(retrieveEvidenceMock).toHaveBeenCalledTimes(2);
    // Second call: generic term for the nightlife intent, trip destination as the location.
    expect(retrieveEvidenceMock.mock.calls[1][0]).toEqual([{ tool: "search_places", query: "bars", location: "China" }]);
    expect(streamTextMock).toHaveBeenCalled();
    const { meta } = await readMeta(response);
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

  it("adds distance-to-locked-place on discovery cards", async () => {
    loadTripContextMock.mockResolvedValue({ trip: { name: "T", destination: "Lisbon", origin: null, duration_days: 5, travelers: 2 }, preferences: {}, itinerary: [], lockedTitles: ["Jerónimos Monastery"], lockedPlaces: [{ title: "Jerónimos Monastery", latitude: 38.6979, longitude: -9.2064 }], places: [], decisions: [] });
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Lisbon", intent: "discovery", wantsComparison: false, toolPlan: [{ tool: "search_places", query: "sights", location: "Lisbon" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p1", name: "Belém Tower", category: "tourist_attraction", latitude: 38.6916, longitude: -9.216, address: "Belém", sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const { meta } = await readMeta(await post());
    const card = (meta!.blocks as Array<{ type: string; places: Array<Record<string, unknown>> }>).find((b) => b.type === "place_list")!.places[0];
    expect(String(card.distanceToLocked)).toMatch(/from Jerónimos Monastery/);
  });

  it("passes the trip's stored dislikes into retrieval", async () => {
    loadTripContextMock.mockResolvedValue({ trip: { name: "T", destination: "China", origin: null, duration_days: 8, travelers: 5 }, preferences: { dislikes: ["museums"] }, itinerary: [], lockedTitles: [], lockedPlaces: [], places: [], decisions: [] });
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "Club", category: "night_club", latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    await post();
    expect(retrieveEvidenceMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dislikes: ["museums"], currency: "CAD" }), expect.anything());
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
    const appendArgs = appendSpy.mock.calls.at(-1)![1] as { content: string };
    expect(appendArgs.content).toBe("Bar Rouge is the pick for a Bund view.");
  });

  it("turns a proposedProfileUpdate into an update_preferences command", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Shanghai", intent: "nightlife", wantsComparison: false, toolPlan: [], clarify: null, suggestedFollowups: [], proposedProfileUpdate: { budget: 120 } });
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const response = await post();
    const { meta } = await readMeta(response);
    expect(meta!.proposedCommand).toMatchObject({ type: "update_preferences", tripId: TRIP, preferences: { budget: 120 } });
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

  it("returns a structured 5xx (not a stack) when RETRIEVE throws unexpectedly", async () => {
    retrieveEvidenceMock.mockRejectedValue(new Error("provider layer exploded"));
    const response = await post();
    expect(response.status).toBeGreaterThanOrEqual(500);
    const body = await response.json();
    expect(body).toMatchObject({ error: expect.any(String) });
    expect(JSON.stringify(body)).not.toMatch(/exploded/); // internal detail not leaked to the client
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

  it("surfaces a 5xx when every model in the COMPOSE chain fails", async () => {
    composeChainRef.models = [{ model: { id: "primary" } }, { model: { id: "fallback" } }];
    compose.failFirstN = 2;
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const response = await post();
    expect(response.status).toBeGreaterThanOrEqual(500);
  });

  it("streams and persists a very large model reply without truncating it", async () => {
    compose.text = `Bar Rouge is the pick. ${"padding ".repeat(30_000)}`;
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const response = await post();
    expect(response.status).toBe(200);
    await readMeta(response);
    const persisted = (appendSpy.mock.calls.at(-1)![1] as { content: string }).content;
    expect(persisted.length).toBeGreaterThan(200_000);
    expect(persisted.startsWith("Bar Rouge is the pick.")).toBe(true);
  });
});
