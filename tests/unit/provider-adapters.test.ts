import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetProviderGuards } from "../../lib/server/provider-guard";
import { broadenQuery, GooglePlacesProvider } from "../../packages/providers/google-places/client";
import { ticketmasterIdFromUrl } from "../../packages/providers/ticketmaster/client";
import { OpenAiCompatibleProvider } from "../../packages/ai/providers/openai-compatible";
import { createAiGateway, createBulkGateway } from "../../packages/ai/gateway";
import { route } from "../../packages/providers/mapbox/client";
import { transit } from "../../packages/providers/google-places/transit";
import { transitAppPlan } from "../../packages/providers/transit-app/client";
import { searchFlights } from "../../packages/providers/duffel/client";
import { bookStay, cancelBooking, hotelDetails, prebookRate, searchStays, stayRooms } from "../../packages/providers/liteapi/client";
import { cancelOrder, createOrder } from "../../packages/providers/duffel/client";
import { localEvents } from "../../packages/providers/eventbrite/client";
import { activities } from "../../packages/providers/getyourguide/client";
import { withProviderTimeout } from "../../packages/providers/request-signal";
import { events } from "../../packages/providers/ticketmaster/client";
import { weather } from "../../packages/providers/openweather/client";
import { predictHqEvents } from "../../packages/providers/predicthq/client";

beforeEach(() => resetProviderGuards());
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.MAPBOX_ACCESS_TOKEN;
  delete process.env.TAVILY_API_KEY;
  delete process.env.TICKETMASTER_API_KEY;
  delete process.env.OPENWEATHER_API_KEY;
  delete process.env.TRANSIT_API_KEY;
  delete process.env.EVENTBRITE_API_KEY;
  delete process.env.GETYOURGUIDE_API_KEY;
  delete process.env.DUFFEL_API_KEY;
  delete process.env.LITEAPI_KEY;
  delete process.env.CONNECT_API_KEY;
  delete process.env.PREDICTHQ_API_KEY;
  delete process.env.AI_PROVIDER;
  delete process.env.CEREBRAS_API_KEY;
  delete process.env.AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_MODEL;
  delete process.env.AI_BASE_URL;
});

describe("broadenQuery", () => {
  it("adds sibling places-of-worship terms the query is missing", () => {
    const out = broadenQuery("temples in Amritsar");
    expect(out).toContain("gurdwara");
    expect(out).toContain("church");
    expect(out.startsWith("temples in Amritsar")).toBe(true);
  });
  it("does not double-add a term already present", () => {
    expect(broadenQuery("church and mosque")).not.toMatch(/mosque.*mosque/);
  });
  it("leaves an unrelated query untouched", () => {
    expect(broadenQuery("best ramen in Tokyo")).toBe("best ramen in Tokyo");
  });
  it("broadens adventure and water-sport queries to sibling activities", () => {
    const adv = broadenQuery("bungee jumping near Rishikesh");
    expect(adv).toContain("zipline");
    expect(adv).toContain("paragliding");
    const water = broadenQuery("kayaking in Halong Bay");
    expect(water).toContain("boat tour");
    expect(water).toContain("sailing");
  });
});

describe("ticketmasterIdFromUrl", () => {
  it("pulls the discovery id out of a Ticketmaster event URL", () => {
    expect(ticketmasterIdFromUrl("https://www.ticketmaster.ca/some-show-tickets/event/1000600F8E9A2C4B")).toBe("1000600F8E9A2C4B");
    expect(ticketmasterIdFromUrl("https://www.ticketmaster.com/event/vvG1zZ9Yb7abcd")).toBe("vvG1zZ9Yb7abcd");
  });
  it("returns null when there is no id-shaped segment", () => {
    expect(ticketmasterIdFromUrl("https://example.com/events")).toBeNull();
    expect(ticketmasterIdFromUrl("not a url")).toBeNull();
  });
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
      expect(JSON.parse(init.body as string).model).toBe("gpt-4o");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-real");
    });
  });

  it("throws a clear error when no key is resolvable", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "";
    expect(() => createAiGateway()).toThrow(/AI_API_KEY or OPENAI_API_KEY/);
  });

  it("routes a pinned gemini provider to the Gemini OpenAI endpoint and ignores AI_BASE_URL / AI_MODEL", () => {
    process.env.AI_BASE_URL = "https://proxy.example/v1";
    process.env.AI_MODEL = "gpt-4o";
    process.env.GEMINI_API_KEY = "AIza-real";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return createAiGateway({ provider: "gemini" }).generateText([{ role: "user", content: "hi" }]).then(() => {
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
      expect(JSON.parse(init.body as string).model).toBe("gemini-flash-latest");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer AIza-real");
      delete process.env.GEMINI_API_KEY;
    });
  });

  it("createBulkGateway uses Gemini only when a model is pinned, else the primary fail-over chain", () => {
    process.env.AI_PROVIDER = "";
    process.env.AI_BASE_URL = "";
    process.env.OPENAI_API_KEY = "sk-real";
    delete process.env.GEMINI_BULK_MODEL;
    const fetchMock = vi.fn((_url?: unknown, _init?: unknown) => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    return createBulkGateway().generateText([{ role: "user", content: "x" }]).then(() => {
      expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions"); // no Gemini key → primary
      // Gemini key alone is NOT enough — its default model ids lapse silently.
      process.env.GEMINI_API_KEY = "AIza-real";
      return createBulkGateway().generateText([{ role: "user", content: "x" }]);
    }).then(() => {
      expect(fetchMock.mock.calls[1][0]).toBe("https://api.openai.com/v1/chat/completions"); // still primary
      // key + an explicit model → opt in to Gemini
      process.env.GEMINI_BULK_MODEL = "gemini-flash-latest";
      return createBulkGateway().generateText([{ role: "user", content: "x" }]);
    }).then(() => {
      expect(fetchMock.mock.calls[2][0]).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_BULK_MODEL;
    });
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

  it("eventDetailBySearch matches on name + date and maps the rich fields", async () => {
    process.env.TICKETMASTER_API_KEY = "test-key";
    const { eventDetailBySearch } = await import("../../packages/providers/ticketmaster/client");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      _embedded: { events: [
        { name: "Some Other Show", dates: { start: { localDate: "2026-09-01" } } },
        {
          name: "ARLO PARKS - DESIRE TOUR", url: "https://ticketmaster.ca/x/event/ABC",
          dates: { start: { localDate: "2026-09-03", localTime: "20:00:00" } },
          classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" }, subGenre: { name: "Alternative Rock" } }],
          priceRanges: [{ min: 45, max: 89, currency: "CAD" }],
          sales: { public: { startDateTime: "2026-03-13T14:00:00Z", endDateTime: "2026-09-04T02:00:00Z" } },
          seatmap: { staticUrl: "https://maps.example/seat.png" },
          pleaseNote: "Doors open at 6:30 PM. 18+ event.",
          _embedded: { attractions: [{ name: "Arlo Parks" }, { name: "Baird" }], venues: [{ name: "MTELUS", city: { name: "Montreal" }, address: { line1: "59 Rue Sainte-Catherine Est" } }] },
        },
      ] },
    }), { status: 200 })));
    const d = await eventDetailBySearch("Arlo Parks - Desire Tour", "Montreal", "2026-09-03");
    expect(d).toMatchObject({
      title: "ARLO PARKS - DESIRE TOUR",
      genre: "Music · Rock · Alternative Rock",
      priceRange: "45–89 CAD",
      performers: ["Arlo Parks", "Baird"],
      seatmapUrl: "https://maps.example/seat.png",
      doorsTime: expect.stringMatching(/6:30/),
      ageInfo: expect.stringMatching(/18/),
    });
    expect(d?.venue?.name).toBe("MTELUS");
  });

  it("geocodes on the OpenWeather key and builds a current-plus-outlook summary from /forecast", async () => {
    process.env.OPENWEATHER_API_KEY = "test-key";
    const slot = (dt: number, temp: number, main: string) => ({ dt, main: { temp, temp_min: temp - 2, temp_max: temp + 2 }, weather: [{ main, description: main.toLowerCase() }] });
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.includes("/geo/1.0/direct")
          ? new Response(JSON.stringify([{ name: "Montreal", lat: 45.5, lon: -73.56 }]), { status: 200 })
          : new Response(
              JSON.stringify({
                city: { timezone: -14400 },
                list: [
                  slot(1_756_000_000, 21, "Clear"),
                  slot(1_756_000_000 + 43_200, 24, "Rain"),
                  slot(1_756_086_400, 19, "Clouds"),
                ],
              }),
              { status: 200 },
            ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await weather("Montreal");
    expect(result.location).toBe("Montreal");
    expect(result.summary).toContain("21°C now, clear");
    expect(result.days.length).toBeGreaterThan(0);
    expect(result.days[0]).toMatchObject({ label: "Today" });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/2.5/weather"))).toBe(false);
  });

  it("PredictHQ: builds the query, parses rank/venue, and only rank-filters a broad sweep", async () => {
    process.env.PREDICTHQ_API_KEY = "phq-key";
    let seen = "";
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      seen = String(url);
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer phq-key");
      return Promise.resolve(new Response(JSON.stringify({ results: [
        { title: "Big Festival", start: "2026-10-30T18:00:00", local_rank: 88, phq_attendance: 40000, category: "festivals", entities: [{ type: "venue", name: "Parc Jean-Drapeau" }] },
        { title: "Undated Thing", local_rank: 40 },       // no start -> no date
        { start: "2026-10-31", local_rank: 10 },          // no title -> dropped
      ] }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const broad = await predictHqEvents("", [-73.5673, 45.5017], { start: "2026-10-12", end: "2026-11-15" }, undefined, true);
    expect(seen).toContain("within=25km%4045.5017%2C-73.5673");
    expect(seen).toContain("active.gte=2026-10-12");
    expect(seen).toContain("active.lte=2026-11-15");
    expect(seen).toContain("rank_level=3%2C4%2C5"); // broad only
    expect(seen).toContain("sort=-rank");
    expect(broad.map((e) => e.title)).toEqual(["Big Festival", "Undated Thing"]); // titleless dropped
    expect(broad[0]).toMatchObject({ rank: 88, attendance: 40000, venue: "Parc Jean-Drapeau", startDate: "2026-10-30" });
    expect(broad[0].url).toContain("google.com/search"); // no ticket link -> web-search fallback
    expect(broad[1].startDate).toBeUndefined();

    seen = "";
    await predictHqEvents("Bruno Mars", [-73.5673, 45.5017], {}, undefined, false);
    expect(seen).toContain("q=Bruno+Mars");
    expect(seen).not.toContain("rank_level"); // specific query -> no rank floor
  });

  it("PredictHQ: throws when no key is configured", async () => {
    await expect(predictHqEvents("x", [0, 0], {})).rejects.toThrow(/PREDICTHQ_API_KEY/);
  });

  it("normalizes Google transit routes and requests only valid fieldmask paths", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{
      distanceMeters: 22072,
      duration: "4197s",
      legs: [{ steps: [
        { travelMode: "WALK", staticDuration: "30s" },
        { travelMode: "TRANSIT", staticDuration: "2086s", transitDetails: { transitLine: { nameShort: "208", vehicle: { type: "BUS" }, agencies: [{ name: "Carris" }] }, headsign: "Cais Sodré", stopCount: 9, stopDetails: { departureStop: { name: "Airport", departureTime: "2026-09-02T09:00:00Z" }, arrivalStop: { name: "Cais Sodré" } } } },
      ] }],
    }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const [first] = await transit({ origin: "Lisbon Airport", destination: "Belém" });
    expect(first).toMatchObject({ provider: "google-routes", distanceMeters: 22072, durationSeconds: 4197, departureTime: "2026-09-02T09:00:00Z" });
    expect(first.steps).toHaveLength(2);
    expect(first.steps[0]).toMatchObject({ mode: "walk" });
    expect(first.steps[1]).toMatchObject({ mode: "bus", line: "208", agency: "Carris", stopCount: 9, departureStop: "Airport", arrivalStop: "Cais Sodré" });
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

  it("normalizes GetYourGuide tours into activity results", async () => {
    process.env.GETYOURGUIDE_API_KEY = "gyg-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { tours: [
      { tour_id: 62484, title: "Old Town Walking Tour", abstract: "See the historic centre with a local guide.", url: "https://www.getyourguide.com/-l1/-t62484", overall_rating: 4.7, price: { values: { amount: "29.00", currency: "EUR" } } },
      { title: "No URL Tour", url: "" },
      { url: "https://x/only-url" },
    ] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const found = await activities("things to do Lisbon", "EUR");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ title: "Old Town Walking Tour", url: "https://www.getyourguide.com/-l1/-t62484", provider: "getyourguide" });
    expect(found[0].content).toContain("from 29.00 EUR");
    expect(found[0].content).toContain("4.7★");
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://api.getyourguide.com/1/tours");
    expect(url.searchParams.get("currency")).toBe("EUR");
    expect((fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers["x-access-token"]).toBe("gyg-token");
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

  it("returns every room rate for a single-hotel drill-down, keeping ids and cancellation deadlines", async () => {
    process.env.CONNECT_API_KEY = "sand_x";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { hotelId: "h1", roomTypes: [
        { offerId: "off-1", offerRetailRate: { amount: 690, currency: "EUR" }, rates: [{ rateId: "rate-1", name: "Deluxe", boardName: "Breakfast", maxOccupancy: 2, retailRate: { total: [{ amount: 690, currency: "EUR" }], taxesAndFees: [{ amount: 62, currency: "EUR" }] }, cancellationPolicies: { refundableTag: "RFN", cancelPolicyInfos: [{ cancelTime: "2026-10-12T00:00:00Z" }] } }] },
        { offerId: "off-2", offerRetailRate: { amount: 900, currency: "EUR" }, rates: [{ rateId: "rate-2", name: "Suite", boardName: "Room Only", cancellationPolicies: { refundableTag: "NRFN" } }] },
      ] },
    ] }), { status: 200 })));
    const { nights, rooms } = await stayRooms({ hotelId: "h1", checkin: "2026-10-15", checkout: "2026-10-18" });
    expect(nights).toBe(3);
    expect(rooms.map((r) => r.name)).toEqual(["Deluxe", "Suite"]);
    expect(rooms[0]).toMatchObject({ offerId: "off-1", rateId: "rate-1", nightlyAmount: 230, totalAmount: 690, taxesAndFees: 62, maxOccupancy: 2, refundable: true, boardName: "Breakfast", cancelBefore: "2026-10-12T00:00:00Z" });
    expect(rooms[1]).toMatchObject({ refundable: false, cancelBefore: null, taxesAndFees: null, maxOccupancy: null });
  });

  it("normalizes LiteAPI hotel details: gallery order, stripped html, missing fields", async () => {
    process.env.LITEAPI_KEY = "sand_x";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {
      id: "h1", name: "Torel Palace", hotelDescription: "<p>A <b>palace</b> hotel.</p>",
      hotelImages: [{ url: "https://img/2.jpg", order: 2 }, { url: "https://img/1.jpg", order: 1 }, { url: "https://img/hero.jpg", order: 5, defaultImage: true }],
      hotelFacilities: ["Pool", "Wi-Fi", "Pool"],
      checkinCheckoutTimes: { checkinStart: "15:00", checkinEnd: "23:00", checkout: "11:00" },
      address: "Rua Câmara Pestana", city: "Lisbon", country: "PT", location: { latitude: 38.72, longitude: -9.14 }, starRating: 5, rating: 9.4, reviewCount: 1200,
      rooms: [{ roomName: "Deluxe", maxOccupancy: 2, photos: [{ url: "https://img/deluxe.jpg" }] }],
    } }), { status: 200 })));
    const details = await hotelDetails("h1");
    expect(details.images).toEqual(["https://img/hero.jpg", "https://img/1.jpg", "https://img/2.jpg"]);
    expect(details.description).toBe("A palace hotel.");
    expect(details.facilities).toEqual(["Pool", "Wi-Fi"]);
    expect(details).toMatchObject({ checkinFrom: "15:00", checkinTo: "23:00", checkout: "11:00", latitude: 38.72, stars: 5 });
    expect(details.roomCatalogue[0]).toMatchObject({ name: "Deluxe", maxOccupancy: 2, photo: "https://img/deluxe.jpg" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "h2", thumbnail: "https://img/t.jpg" } }), { status: 200 })));
    const sparse = await hotelDetails("h2");
    expect(sparse).toMatchObject({ name: "Hotel", description: null, images: ["https://img/t.jpg"], facilities: [], checkinFrom: null, roomCatalogue: [] });
  });

  it("throws when no LiteAPI key is configured", async () => {
    await expect(searchStays({ city: "Lisbon", checkin: "2026-10-15", checkout: "2026-10-18" })).rejects.toThrow(/LITEAPI_KEY/);
  });

  it("prebooks a LiteAPI offer and books it with the sandbox no-card payment method", async () => {
    process.env.LITEAPI_KEY = "sand_x";
    const fetchMock = vi.fn().mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("/rates/prebook")) return Promise.resolve(new Response(JSON.stringify({ data: { prebookId: "pb_1" } }), { status: 200 }));
      if (url.includes("/rates/book")) return Promise.resolve(new Response(JSON.stringify({ data: { bookingId: "bk_1", status: "CONFIRMED", hotelConfirmationCode: "test", price: 465.85, currency: "USD" } }), { status: 200 }));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { prebookId } = await prebookRate("offer-abc");
    expect(prebookId).toBe("pb_1");
    const prebookBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(prebookBody).toEqual({ offerId: "offer-abc", usePaymentSdk: false });

    const booking = await bookStay(prebookId, [{ firstName: "Jane", lastName: "Doe", email: "jane@example.com", occupancyNumber: 1 }]);
    expect(booking).toMatchObject({ bookingId: "bk_1", status: "CONFIRMED", confirmationCode: "test", totalAmount: 465.85, currency: "USD" });
    const bookBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(bookBody).toMatchObject({ prebookId: "pb_1", payment: { method: "ACC_CREDIT_CARD" }, guests: [{ firstName: "Jane", lastName: "Doe", email: "jane@example.com", occupancyNumber: 1 }] });
  });

  it("books a Duffel offer against its own re-fetched price, with a balance payment", async () => {
    process.env.DUFFEL_API_KEY = "test-key";
    const fetchMock = vi.fn().mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("/air/offers/off_1")) return Promise.resolve(new Response(JSON.stringify({ data: { total_amount: "162.48", total_currency: "USD" } }), { status: 200 }));
      if (url.includes("/air/orders")) return Promise.resolve(new Response(JSON.stringify({ data: { id: "ord_1", booking_reference: "3HYAPM", total_amount: "162.48", total_currency: "USD", payment_status: { paid_at: "2026-09-07T02:39:14Z" } } }), { status: 201 }));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const passenger = { id: "pas_1", title: "mr", givenName: "Jane", familyName: "Doe", bornOn: "1990-01-01", gender: "f", email: "jane@example.com", phoneNumber: "+12025550123" };
    const order = await createOrder("off_1", ["pas_1"], [passenger]);
    expect(order).toMatchObject({ orderId: "ord_1", bookingReference: "3HYAPM", status: "confirmed", totalAmount: "162.48", totalCurrency: "USD" });

    const orderBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(orderBody.data).toMatchObject({ type: "instant", selected_offers: ["off_1"], payments: [{ type: "balance", amount: "162.48", currency: "USD" }] });
    expect(orderBody.data.passengers[0]).toMatchObject({ id: "pas_1", given_name: "Jane", family_name: "Doe", born_on: "1990-01-01", phone_number: "+12025550123" });
  });

  it("createOrder rejects when a passenger's details weren't supplied", async () => {
    process.env.DUFFEL_API_KEY = "test-key";
    await expect(createOrder("off_1", ["pas_1", "pas_2"], [{ id: "pas_1", title: "mr", givenName: "Jane", familyName: "Doe", bornOn: "1990-01-01", gender: "f", email: "jane@example.com", phoneNumber: "+1" }]))
      .rejects.toThrow(/pas_2/);
  });

  it("cancels a Duffel order via quote-then-confirm", async () => {
    process.env.DUFFEL_API_KEY = "test-key";
    const fetchMock = vi.fn().mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("/air/order_cancellations/oc_1/actions/confirm")) return Promise.resolve(new Response(JSON.stringify({ data: { confirmed_at: "2026-09-07T03:00:00Z", refund_amount: "162.48", refund_currency: "USD" } }), { status: 200 }));
      if (url.includes("/air/order_cancellations")) return Promise.resolve(new Response(JSON.stringify({ data: { id: "oc_1", refund_amount: "162.48", refund_currency: "USD" } }), { status: 200 }));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder("ord_1");
    expect(result).toEqual({ status: "cancelled", refundAmount: "162.48", refundCurrency: "USD" });
    const quoteBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(quoteBody.data).toEqual({ order_id: "ord_1" });
    expect(String(fetchMock.mock.calls[1][0])).toContain("/air/order_cancellations/oc_1/actions/confirm");
  });

  it("cancels a LiteAPI booking via PUT /bookings/{id}", async () => {
    process.env.LITEAPI_KEY = "sand_x";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: "CANCELLED" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelBooking("bk_1");
    expect(result).toEqual({ status: "CANCELLED" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/bookings/bk_1");
    expect((init as { method?: string }).method).toBe("PUT");
  });

  it("normalizes Mapbox route geometry and rejects failed responses", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{ distance: 1200, duration: 600, geometry: { type: "LineString", coordinates: [[-79.38, 43.65], [-79.39, 43.66]] } }] }), { status: 200 })));
    await expect(route({ origin: [-79.38, 43.65], destination: [-79.39, 43.66] })).resolves.toMatchObject({ provider: "mapbox", distanceMeters: 1200, durationSeconds: 600 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    await expect(route({ origin: [-79.38, 43.65], destination: [-79.39, 43.66] })).rejects.toThrow(/503/);
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
