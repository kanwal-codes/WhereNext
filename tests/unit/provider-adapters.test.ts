import { afterEach, describe, expect, it, vi } from "vitest";
import { GooglePlacesProvider } from "../../packages/providers/google-places/client";
import { OpenAiCompatibleProvider } from "../../packages/ai/providers/openai-compatible";
import { createAiGateway } from "../../packages/ai/gateway";
import { route } from "../../packages/providers/mapbox/client";
import { transit } from "../../packages/providers/google-places/transit";
import { transitAppPlan } from "../../packages/providers/transit-app/client";
import { searchFlights } from "../../packages/providers/duffel/client";
import { searchStays, stayRooms } from "../../packages/providers/liteapi/client";
import { localEvents } from "../../packages/providers/eventbrite/client";
import { withProviderTimeout } from "../../packages/providers/request-signal";
import { events } from "../../packages/providers/ticketmaster/client";
import { weather } from "../../packages/providers/openweather/client";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.MAPBOX_ACCESS_TOKEN;
  delete process.env.TAVILY_API_KEY;
  delete process.env.TICKETMASTER_API_KEY;
  delete process.env.OPENWEATHER_API_KEY;
  delete process.env.TRANSIT_API_KEY;
  delete process.env.EVENTBRITE_API_KEY;
  delete process.env.DUFFEL_API_KEY;
  delete process.env.LITEAPI_KEY;
  delete process.env.CONNECT_API_KEY;
  delete process.env.AI_PROVIDER;
  delete process.env.CEREBRAS_API_KEY;
  delete process.env.AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_MODEL;
  delete process.env.AI_BASE_URL;
});

describe("createAiGateway env resolution", () => {
  it("falls through blank env vars to the OpenAI defaults", () => {
    process.env.AI_PROVIDER = "";
    process.env.AI_API_KEY = "";
    process.env.AI_MODEL = "";
    process.env.AI_BASE_URL = "";
    process.env.OPENAI_API_KEY = "sk-real";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return createAiGateway().generateText([{ role: "user", content: "hi" }]).then(() => {
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      expect(JSON.parse(init.body as string).model).toBe("gpt-4o-mini");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-real");
    });
  });

  it("throws a clear error when no key is resolvable", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "";
    expect(() => createAiGateway()).toThrow(/AI_API_KEY or OPENAI_API_KEY/);
  });
});

describe("provider adapters", () => {
  it("normalizes Google Places search results and photo names", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [{ id: "places/1", displayName: { text: "Museum" }, location: { latitude: 43.65, longitude: -79.38 }, photos: [{ name: "places/1/photos/p1" }] }] }), { status: 200 })));
    const [place] = await new GooglePlacesProvider().search("museum");
    expect(place).toMatchObject({ provider: "google-places", providerId: "places/1", name: "Museum", latitude: 43.65, longitude: -79.38, photoNames: ["places/1/photos/p1"] });
  });

  it("normalizes Ticketmaster events into structured fields", async () => {
    process.env.TICKETMASTER_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ _embedded: { events: [{ name: "Festival", url: "https://tickets.example/festival", dates: { start: { localDate: "2026-09-04", localTime: "20:00:00" } }, _embedded: { venues: [{ name: "Arena", city: { name: "Montreal" } }] } }] } }), { status: 200 })));
    await expect(events("festival", "Montreal")).resolves.toMatchObject([{ title: "Festival", url: "https://tickets.example/festival", date: "2026-09-04 20:00", venue: "Arena, Montreal" }]);
  });

  it("normalizes OpenWeather conditions", async () => {
    process.env.OPENWEATHER_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ current: { temp: 21, weather: [{ description: "clear sky" }] }, daily: [{ temp: { min: 15, max: 24 }, weather: [{ description: "sunny" }] }] }), { status: 200 })));
    await expect(weather({ latitude: 45.5, longitude: -73.56, name: "Montreal" })).resolves.toMatchObject({ location: "Montreal", summary: expect.stringContaining("21°C") });
  });

  it("normalizes Google transit routes and requests only valid fieldmask paths", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{
      distanceMeters: 22072,
      duration: "4197s",
      legs: [{ steps: [
        { travelMode: "WALK", staticDuration: "30s" },
        { travelMode: "TRANSIT", staticDuration: "2086s", transitDetails: { transitLine: { nameShort: "208" }, headsign: "Cais Sodré", stopDetails: { departureStop: { name: "Airport", departureTime: "2026-09-02T09:00:00Z" }, arrivalStop: { name: "Cais Sodré" } } } },
      ] }],
    }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const [first] = await transit({ origin: "Lisbon Airport", destination: "Belém" });
    expect(first).toMatchObject({ provider: "google-routes", distanceMeters: 22072, durationSeconds: 4197, departureTime: "2026-09-02T09:00:00Z" });
    expect(first.steps).toHaveLength(2);
    expect(first.steps[1]).toMatchObject({ mode: "TRANSIT", line: "208", departureStop: "Airport", arrivalStop: "Cais Sodré" });
    const fieldmask = (fetchMock.mock.calls[0][1].headers as Record<string, string>)["x-goog-fieldmask"];
    expect(fieldmask).not.toContain("legs.startTime");
    expect(fieldmask).not.toContain("legs.endTime");
  });

  it("normalizes Eventbrite destination-search events", async () => {
    process.env.EVENTBRITE_API_KEY = "eb-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: { results: [
      { name: "Night Market", url: "https://www.eventbrite.ca/e/night-market", start_date: "2026-09-14", primary_venue: { name: "Distillery District" } },
      { name: { text: "Book Launch" }, url: "https://www.eventbrite.ca/e/book-launch", start: { local: "2026-09-20T18:00:00" } },
      { name: "No URL", start_date: "2026-09-01" },
    ] } }), { status: 200 })));
    const found = await localEvents("market", 43.65, -79.38);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ title: "Night Market", url: "https://www.eventbrite.ca/e/night-market", date: "2026-09-14", venue: "Distillery District", provider: "eventbrite" });
    expect(found[1]).toMatchObject({ title: "Book Launch", date: "2026-09-20" });
  });

  it("normalizes a Transit App plan and returns null when uncovered", async () => {
    process.env.TRANSIT_API_KEY = "transit_publicapi_v4_x";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{
      duration: 763, start_time: 1788313950, end_time: 1788314713,
      legs: [
        { leg_mode: "walk", duration: 150, distance: 151 },
        { leg_mode: "transit", duration: 480, routes: [{ route_short_name: "504" }] },
        { leg_mode: "walk", duration: 133, distance: 78 },
      ],
    }] }), { status: 200 })));
    const plan = await transitAppPlan([-79.3806, 43.6453], [-79.386, 43.6709]);
    expect(plan).toMatchObject({ provider: "transit-app", durationSeconds: 763, distanceMeters: 229 });
    expect(plan!.steps.map((s) => s.mode)).toEqual(["WALK", "TRANSIT", "WALK"]);
    expect(plan!.steps[1].line).toBe("504");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 })));
    expect(await transitAppPlan([135.7588, 34.9858], [135.785, 34.9948])).toBeNull();
  });

  it("resolves names to IATA and maps Duffel offers cheapest-first", async () => {
    process.env.DUFFEL_API_KEY = "duffel_test_x";
    const fetchMock = vi.fn().mockImplementation((input: unknown, init?: { method?: string }) => {
      const url = String(input);
      if (url.includes("/places/suggestions")) {
        return Promise.resolve(new Response(JSON.stringify({ data: [
          { type: "airport", iata_code: "YYZ" }, { type: "city", iata_code: url.includes("Toronto") ? "YTO" : "LON" },
        ] }), { status: 200 }));
      }
      if (url.includes("/air/offer_requests") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ data: { id: "orq_1" } }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: [
        { total_amount: "812.40", total_currency: "CAD", owner: { name: "Air Canada" }, slices: [{ duration: "PT8H11M", segments: [
          { departing_at: "2026-10-13T18:20:00", arriving_at: "2026-10-13T22:00:00" },
          { departing_at: "2026-10-13T23:00:00", arriving_at: "2026-10-14T06:31:00" },
        ] }] },
      ] }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const offers = await searchFlights({ origin: "Toronto", destination: "London", departureDate: "2026-10-13" });
    expect(offers[0]).toMatchObject({ airline: "Air Canada", priceAmount: "812.40", priceCurrency: "CAD", durationMinutes: 491, stops: 1 });
    const requestBody = JSON.parse(String(fetchMock.mock.calls.find((call) => String(call[0]).includes("/air/offer_requests"))![1].body));
    expect(requestBody.data.slices).toEqual([{ origin: "YTO", destination: "LON", departure_date: "2026-10-13" }]);
  });

  it("joins LiteAPI hotel data with rates into cheapest-first stay options", async () => {
    process.env.LITEAPI_KEY = "sand_x";
    const hotels = { data: [
      { id: "h1", name: "Torel Palace", address: "Rua Câmara Pestana", city: "Lisbon", latitude: 38.72, longitude: -9.14, stars: 5, rating: 9.4, reviewCount: 1195, thumbnail: "https://img/h1.jpg" },
      { id: "h2", name: "Holiday Inn Express", city: "Lisbon", latitude: 38.71, longitude: -9.15, stars: 3, rating: 8.1, reviewCount: 30, thumbnail: null },
      { id: "h3", name: "No Availability Inn", city: "Lisbon", latitude: 38.7, longitude: -9.16, stars: 2, rating: 7, reviewCount: 5, thumbnail: null },
    ] };
    const rates = { data: [
      { hotelId: "h2", roomTypes: [{ offerRetailRate: { amount: 300, currency: "EUR" }, rates: [{ name: "Standard", boardName: "Breakfast", retailRate: { total: [{ amount: 300, currency: "EUR" }] }, cancellationPolicies: { refundableTag: "RFN" } }] }] },
      { hotelId: "h1", roomTypes: [
        { offerRetailRate: { amount: 900, currency: "EUR" }, rates: [{ name: "Suite", boardName: "Room Only", retailRate: { total: [{ amount: 900, currency: "EUR" }] }, cancellationPolicies: { refundableTag: "NRFN" } }] },
        { offerRetailRate: { amount: 690, currency: "EUR" }, rates: [{ name: "Deluxe", boardName: "Breakfast", retailRate: { total: [{ amount: 690, currency: "EUR" }] }, cancellationPolicies: { refundableTag: "RFN" } }] },
      ] },
    ] };
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown, init?: { method?: string }) => {
      const url = String(input);
      if (url.includes("/data/hotels")) return Promise.resolve(new Response(JSON.stringify(hotels), { status: 200 }));
      if (url.includes("/hotels/rates") && init?.method === "POST") return Promise.resolve(new Response(JSON.stringify(rates), { status: 200 }));
      return Promise.reject(new Error(`unexpected ${url}`));
    }));
    const result = await searchStays({ latitude: 38.72, longitude: -9.14, checkin: "2026-10-15", checkout: "2026-10-18" });
    expect(result.nights).toBe(3);
    expect(result.options.map((o) => o.name)).toEqual(["Holiday Inn Express", "Torel Palace"]); // h3 has no rate -> dropped, sorted by nightly
    expect(result.options[0]).toMatchObject({ nightlyAmount: 100, totalAmount: 300, currency: "EUR", refundable: true, reviewCount: 30 });
    expect(result.options[1]).toMatchObject({ nightlyAmount: 230, totalAmount: 690, boardName: "Breakfast" }); // cheapest of h1's two room types
  });

  it("returns every room type for a single-hotel drill-down", async () => {
    process.env.CONNECT_API_KEY = "sand_x";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { hotelId: "h1", roomTypes: [
        { offerRetailRate: { amount: 690, currency: "EUR" }, rates: [{ name: "Deluxe", boardName: "Breakfast", cancellationPolicies: { refundableTag: "RFN" } }] },
        { offerRetailRate: { amount: 900, currency: "EUR" }, rates: [{ name: "Suite", boardName: "Room Only", cancellationPolicies: { refundableTag: "NRFN" } }] },
      ] },
    ] }), { status: 200 })));
    const { nights, rooms } = await stayRooms({ hotelId: "h1", checkin: "2026-10-15", checkout: "2026-10-18" });
    expect(nights).toBe(3);
    expect(rooms.map((r) => r.name)).toEqual(["Deluxe", "Suite"]);
    expect(rooms[0]).toMatchObject({ nightlyAmount: 230, totalAmount: 690, refundable: true, boardName: "Breakfast" });
    expect(rooms[1]).toMatchObject({ refundable: false });
  });

  it("throws when no LiteAPI key is configured", async () => {
    await expect(searchStays({ city: "Lisbon", checkin: "2026-10-15", checkout: "2026-10-18" })).rejects.toThrow(/LITEAPI_KEY/);
  });

  it("normalizes Mapbox route geometry and rejects failed responses", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{ distance: 1200, duration: 600, geometry: { type: "LineString", coordinates: [[-79.38, 43.65], [-79.39, 43.66]] } }] }), { status: 200 })));
    await expect(route({ origin: [-79.38, 43.65], destination: [-79.39, 43.66] })).resolves.toMatchObject({ provider: "mapbox", distanceMeters: 1200, durationSeconds: 600 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    await expect(route({ origin: [-79.38, 43.65], destination: [-79.39, 43.66] })).rejects.toThrow("Mapbox directions failed: 503");
  });

  it("combines caller cancellation with a provider timeout", async () => {
    const caller = new AbortController();
    const combined = withProviderTimeout(caller.signal, 50);
    expect(combined.aborted).toBe(false);
    caller.abort();
    expect(combined.aborted).toBe(true);
    const timedOut = withProviderTimeout(undefined, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(timedOut.aborted).toBe(true);
  });

  it("keeps reasoning options provider-specific", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    await new OpenAiCompatibleProvider({ apiKey: "key", baseUrl: "https://example.test/v1", model: "model" }).generateText([{ role: "user", content: "hi" }]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({ max_completion_tokens: 1600 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).not.toHaveProperty("reasoning_format");
    await new OpenAiCompatibleProvider({ apiKey: "key", baseUrl: "https://example.test/v1", model: "model", supportsReasoningOptions: true }).generateText([{ role: "user", content: "hi" }]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({ reasoning_effort: "low", reasoning_format: "hidden" });
  });

  it("retries text generation after a provider rate limit", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new OpenAiCompatibleProvider({ apiKey: "key", baseUrl: "https://example.test/v1", model: "model" }).generateText([{ role: "user", content: "hi" }])).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("parses a JSON object from generateStructured and asks for json_object format", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'noise {"language":"fr","toolPlan":[]} trailing' } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new OpenAiCompatibleProvider({ apiKey: "key", baseUrl: "https://example.test/v1", model: "model" }).generateStructured([{ role: "user", content: "hi" }]);
    expect(result).toEqual({ language: "fr", toolPlan: [] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).response_format).toEqual({ type: "json_object" });
  });

  it("caches repeated production place searches", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.GOOGLE_MAPS_API_KEY = "test-cache-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [{ id: "places/cache", displayName: { text: "Cached place" }, location: { latitude: 1, longitude: 2 } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GooglePlacesProvider();
    await provider.search("unique cache query");
    await provider.search(" UNIQUE CACHE QUERY ");
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  it("cancels retry backoff when the caller aborts", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response("busy", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = new OpenAiCompatibleProvider({ apiKey: "key", baseUrl: "https://example.test/v1", model: "model" }).stream([{ role: "user", content: "hi" }], controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
