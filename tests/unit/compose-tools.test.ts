import { afterEach, describe, expect, it, vi } from "vitest";

const retrieveEvidenceMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/application/retrieve", () => ({ retrieveEvidence: retrieveEvidenceMock }));

import { buildComposeTools } from "@/packages/ai/compose-tools";

const emptyEv = { places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" };
const tripCtx = { trip: null, preferences: {}, itinerary: [{ title: "Castle visit", day_index: 2, locked: true }], lockedTitles: [], lockedPlaces: [], lockedStay: null, places: [{ status: "saved", place: { name: "A Brasileira", category: "cafe", address: null } }], decisions: [] } as never;

function makeTools() {
  const allowedUrls = new Set<string>();
  const { tools, accumulated } = buildComposeTools({
    filters: {}, qualify: (p) => `${p}, Lisbon`, tripStart: "2026-06-10", tripEnd: "2026-06-17", tripCtx, allowedUrls,
  });
  return { tools, accumulated, allowedUrls };
}

afterEach(() => vi.clearAllMocks());

describe("buildComposeTools", () => {
  it("directions: runs one retrieve call, merges routes, records the tool", async () => {
    retrieveEvidenceMock.mockResolvedValue({ ...emptyEv, routes: [{ from: "A", to: "B", mode: "transit", distanceMeters: 3000, durationSeconds: 900, steps: ["Tram 28"] }] });
    const { tools, accumulated } = makeTools();
    const out = await tools.directions.execute!({ from: "Sé", to: "Belém", mode: "transit" }, {} as never);
    expect(retrieveEvidenceMock).toHaveBeenCalledWith([{ tool: "directions", from: "Sé, Lisbon", to: "Belém, Lisbon", mode: "transit" }], {}, undefined);
    expect(out).toEqual([{ from: "A", to: "B", mode: "transit", minutes: 15, km: 3, steps: ["Tram 28"] }]);
    expect(accumulated.routes).toHaveLength(1);
    expect(accumulated.usedTools).toEqual(["directions"]);
  });

  it("research_web: adds surfaced source URLs to the sanitiser allow-list", async () => {
    retrieveEvidenceMock.mockResolvedValue({ ...emptyEv, sources: [{ title: "Guide", url: "https://guide.example/x", content: "..." }] });
    const { tools, allowedUrls } = makeTools();
    await tools.research_web.execute!({ query: "lisbon metro strike" }, {} as never);
    expect(allowedUrls.has("https://guide.example/x")).toBe(true);
  });

  it("stays: fills missing dates from the trip and qualifies the location", async () => {
    retrieveEvidenceMock.mockResolvedValue(emptyEv);
    const { tools } = makeTools();
    await tools.stays.execute!({ location: "Alfama" }, {} as never);
    expect(retrieveEvidenceMock).toHaveBeenCalledWith(
      [{ tool: "stays", location: "Alfama, Lisbon", checkin: "2026-06-10", checkout: "2026-06-17", hotelName: undefined }],
      {}, undefined,
    );
  });

  it("get_itinerary: returns the trip items without a provider call", async () => {
    const { tools, accumulated } = makeTools();
    const out = await tools.get_itinerary.execute!({}, {} as never);
    expect(out).toEqual([{ title: "Castle visit", day: 2, locked: true }]);
    expect(retrieveEvidenceMock).not.toHaveBeenCalled();
    expect(accumulated.usedTools).toEqual(["get_itinerary"]);
  });

  it("search_places: qualifies the location and returns a compact card list", async () => {
    retrieveEvidenceMock.mockResolvedValue({ ...emptyEv, places: [
      { name: "Park Bar", category: "bar", address: "Rua X", rating: 4.4, sourceUrl: "https://maps.example/pb", latitude: 1, longitude: 2, provider: "g", providerId: "p1" },
    ] });
    const { tools, accumulated, allowedUrls } = makeTools();
    const out = await tools.search_places.execute!({ query: "rooftop bars", location: "Bairro Alto" }, {} as never);
    expect(retrieveEvidenceMock).toHaveBeenCalledWith([{ tool: "search_places", query: "rooftop bars", location: "Bairro Alto, Lisbon" }], {}, undefined);
    expect(out).toEqual([{ name: "Park Bar", category: "bar", address: "Rua X", rating: 4.4 }]);
    expect(allowedUrls.has("https://maps.example/pb")).toBe(true); // place sourceUrl added to the allow-list
    expect(accumulated.usedTools).toEqual(["search_places"]);
  });

  it("research_web: returns title/url/excerpt trimmed", async () => {
    retrieveEvidenceMock.mockResolvedValue({ ...emptyEv, sources: [{ title: "Metro news", url: "https://n.example/1", content: "x".repeat(900) }] });
    const { tools } = makeTools();
    const out = await tools.research_web.execute!({ query: "metro" }, {} as never) as Array<{ excerpt: string }>;
    expect(out[0]).toMatchObject({ title: "Metro news", url: "https://n.example/1" });
    expect(out[0].excerpt.length).toBe(500);
  });

  it("events: passes the query straight through and adds event URLs to the allow-list", async () => {
    retrieveEvidenceMock.mockResolvedValue({ ...emptyEv, events: [
      { title: "Jazz Night", url: "https://tm.example/j", date: "2026-06-12", venue: "Hot Club", source: "ticketmaster" },
    ] });
    const { tools, allowedUrls } = makeTools();
    const out = await tools.events.execute!({ query: "jazz", location: "Lisbon" }, {} as never);
    expect(retrieveEvidenceMock).toHaveBeenCalledWith([{ tool: "events", query: "jazz", location: "Lisbon" }], {}, undefined);
    expect(out).toEqual([{ title: "Jazz Night", date: "2026-06-12", venue: "Hot Club", source: "ticketmaster" }]);
    expect(allowedUrls.has("https://tm.example/j")).toBe(true);
  });

  it("flights: fills the departure date from the trip start when omitted", async () => {
    retrieveEvidenceMock.mockResolvedValue({ ...emptyEv, flights: [
      { origin: "LIS", destination: "OPO", departureDate: "2026-06-10", assumedDate: false, offers: [
        { airline: "TAP", priceAmount: "80", priceCurrency: "EUR", stops: 0, durationMinutes: 55, departAt: "x", arriveAt: "y" },
      ] },
    ] });
    const { tools } = makeTools();
    await tools.flights.execute!({ origin: "Lisbon", destination: "Porto" }, {} as never);
    expect(retrieveEvidenceMock).toHaveBeenCalledWith(
      [{ tool: "flights", origin: "Lisbon", destination: "Porto", departureDate: "2026-06-10" }], {}, undefined,
    );
  });

  it("get_saved_places: returns saved/rejected names, no provider call, records the tool", async () => {
    const { tools, accumulated } = makeTools();
    const out = await tools.get_saved_places.execute!({}, {} as never);
    expect(out).toEqual([{ name: "A Brasileira", status: "saved" }]);
    expect(retrieveEvidenceMock).not.toHaveBeenCalled();
    expect(accumulated.usedTools).toEqual(["get_saved_places"]);
  });

  it("accumulates across several tool calls and dedupes usedTools", async () => {
    retrieveEvidenceMock.mockResolvedValue({ ...emptyEv, routes: [{ from: "A", to: "B", mode: "transit", distanceMeters: 1000, durationSeconds: 300, steps: [] }] });
    const { tools, accumulated } = makeTools();
    await tools.directions.execute!({ from: "A", to: "B", mode: "transit" }, {} as never);
    await tools.directions.execute!({ from: "C", to: "D", mode: "transit" }, {} as never);
    expect(accumulated.routes).toHaveLength(2);
    expect(accumulated.usedTools).toEqual(["directions"]); // deduped
  });
});
