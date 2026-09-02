import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";
const KEY = "idem-1";
const PROMPT = "best nightclubs in Shanghai";

const appendSpy = vi.fn(async (_tripId: string, input: unknown) => ({ id: "a1", ...(input as object) }));
const loadTripContextMock = vi.fn();
const resolveTurnMock = vi.fn();
const retrieveEvidenceMock = vi.fn();
const streamMock = vi.fn();
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
vi.mock("@/packages/ai/gateway", () => ({ createAiGateway: () => ({ stream: streamMock }) }));
vi.mock("@/features/conversation/infrastructure/conversationRepository", () => ({
  createConversationRepository: () => ({ list: async () => listRows, append: appendSpy }),
  scopedMessageIdempotencyKey: (role: string, key?: string) => (key ? `${role}:${key}` : null),
}));

function sse(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

async function post() {
  const { POST } = await import("@/app/api/ai/route");
  const request = new Request("http://localhost/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tripId: TRIP, messages: [{ role: "user", content: PROMPT }], messageIdempotencyKey: KEY }),
  });
  return POST(request);
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
  streamMock.mockImplementation(async () => sse("Here are some verified clubs."));
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
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("adds a model-built comparison block when the user asks to compare", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Japan", intent: "discovery", wantsComparison: true, toolPlan: [{ tool: "research_web", query: "Kyoto vs Kanazawa" }], clarify: null, suggestedFollowups: [], proposedProfileUpdate: null });
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
        { hotelId: "h1", name: "Hotel Alfama", address: "Alfama", city: "Lisbon", latitude: 38.71, longitude: -9.13, stars: 4, rating: 8.6, reviewCount: 900, thumbnail: "https://img/h1.jpg", nightlyAmount: 120, totalAmount: 360, currency: "EUR", boardName: "Breakfast", refundable: true },
      ], detail: undefined }],
      unavailableProviders: [], retrievedAt: "2026-09-02T00:00:00Z",
    });
    const { meta } = await readMeta(await post());
    expect(meta).toMatchObject({ surface: "stay" });
    const stays = (meta!.blocks as Array<Record<string, unknown>>).find((b) => b.type === "stays");
    expect(stays).toMatchObject({ location: "Lisbon", nights: 3 });
    expect((stays!.items as Array<Record<string, unknown>>)[0]).toMatchObject({ name: "Hotel Alfama", nightlyPrice: "120", currency: "EUR", refundable: true });
    expect(String(stays!.dateNote)).toMatch(/Example dates/);
    expect(String((stays!.items as Array<Record<string, unknown>>)[0].mapUrl)).toContain("google.com/maps");
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
    expect(retrieveEvidenceMock).toHaveBeenCalledWith(expect.anything(), { dislikes: ["museums"] }, expect.anything());
  });

  it("turns a proposedProfileUpdate into an update_preferences command", async () => {
    resolveTurnMock.mockResolvedValue({ language: "en", locationFocus: "Shanghai", intent: "nightlife", wantsComparison: false, toolPlan: [], clarify: null, suggestedFollowups: [], proposedProfileUpdate: { budget: 120 } });
    retrieveEvidenceMock.mockResolvedValue({ places: [{ provider: "g", providerId: "p", name: "X", category: null, latitude: 1, longitude: 1, address: null, sourceUrl: null }], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" });
    const response = await post();
    const { meta } = await readMeta(response);
    expect(meta!.proposedCommand).toMatchObject({ type: "update_preferences", tripId: TRIP, preferences: { budget: 120 } });
  });
});
