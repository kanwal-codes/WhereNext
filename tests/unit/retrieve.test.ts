import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetProviderGuards } from "../../lib/server/provider-guard";
import { clearMemoryCache } from "../../lib/server/ttl-cache";
import { retrieveEvidence, cleanEventKeyword } from "../../lib/application/retrieve";

describe("cleanEventKeyword", () => {
  it("keeps the artist/genre, drops filler and the destination name", () => {
    expect(cleanEventKeyword("katseye concert in montreal", "Montreal")).toBe("katseye");
    expect(cleanEventKeyword("are there any punjabi concerts between my dates", "Montreal, Canada")).toBe("punjabi");
    expect(cleanEventKeyword("english concert", "Montreal")).toBe("english");
  });
  it("returns empty when nothing meaningful is left", () => {
    expect(cleanEventKeyword("any events happening this weekend", "Lisbon")).toBe("");
  });
});

beforeEach(() => {
  resetProviderGuards();
  // The stays branch now shares the same TTL cache the Stays tab route uses (finding 16); clear
  // it between tests so one test's cached hotel search doesn't leak into the next.
  clearMemoryCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.TAVILY_API_KEY;
  delete process.env.EXA_API_KEY;
  delete process.env.TICKETMASTER_CONSUMER_KEY;
  delete process.env.TICKETMASTER_API_KEY;
  delete process.env.EVENTBRITE_API_KEY;
  delete process.env.DUFFEL_API_KEY;
  delete process.env.LITEAPI_KEY;
  delete process.env.CONNECT_API_KEY;
  delete process.env.OPENWEATHER_API_KEY;
  delete process.env.GOOGLE_WEATHER_API_KEY;
});

describe("retrieveEvidence", () => {
  it("runs no providers for an empty tool plan", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const evidence = await retrieveEvidence([]);
    expect(evidence).toMatchObject({ places: [], sources: [], weather: null, routes: [], unavailableProviders: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches the resolved location and dedupes results", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    // A fresh Response per call — a shared instance's body can only be read once, and this
    // handler now makes two calls (geocode, then the biased search; see search-places.ts).
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ places: [
      { id: "p1", displayName: { text: "Club One" }, location: { latitude: 19, longitude: 72 } },
      { id: "p1b", displayName: { text: "Club One" }, location: { latitude: 19, longitude: 72 } },
    ] }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const evidence = await retrieveEvidence([{ tool: "search_places", query: "retrieve-nightclubs", location: "Mumbai" }]);
    expect(evidence.places).toHaveLength(1);
    expect(evidence.places[0].name).toBe("Club One");
    // A geocode(location) call now runs first (locationBias, see search-places.ts), so the
    // actual query isn't necessarily the first fetch — check across every call made instead.
    expect(fetchMock.mock.calls.some((c) => String((c[1] as RequestInit).body).includes("retrieve-nightclubs in Mumbai"))).toBe(true);
  });

  it("biases the actual search toward the geocoded location, not just the query text (live-testing regression, 2026-09-16)", async () => {
    // Same bug class as the recommendation-panel fix (phase-4-recommendation-ranking.md): Google's
    // Text Search has no structured location of its own, so a real "restaurants in Montreal" call
    // once came back Toronto-dominated. The chatbot's own search_places tool had the identical gap.
    process.env.GOOGLE_MAPS_API_KEY = "k";
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      places: [{ id: "x", displayName: { text: "X" }, location: { latitude: 45.5, longitude: -73.6 } }],
    }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    await retrieveEvidence([{ tool: "search_places", query: "restaurants", location: "Montreal" }]);
    const bodies = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit)?.body).map((c) => JSON.parse(String((c[1] as RequestInit).body)));
    const geocodeCall = bodies.find((b) => b.textQuery === "Montreal");
    const searchCall = bodies.find((b) => String(b.textQuery).includes("restaurants in Montreal"));
    expect(geocodeCall).toBeTruthy(); // ctx.geocode(call.location) ran
    expect(searchCall?.locationBias).toEqual({ circle: { center: { latitude: 45.5, longitude: -73.6 }, radius: 20_000 } });
  });

  it("keeps separate place searches as separate topical sections", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const query = JSON.parse(String(init?.body ?? "{}")).textQuery as string;
      const museum = query.includes("art museums");
      return Promise.resolve(new Response(JSON.stringify({ places: [{
        id: museum ? "museum-1" : "food-1",
        displayName: { text: museum ? "Museum of Fine Arts" : "Damas" },
        location: { latitude: 45.5, longitude: -73.6 },
      }] }), { status: 200 }));
    }));
    const evidence = await retrieveEvidence([
      { tool: "search_places", query: "food places", location: "Montreal" },
      { tool: "search_places", query: "art museums", location: "Montreal" },
    ]);
    expect(evidence.placeGroups?.map((group) => group.label)).toEqual(["food places", "art museums"]);
    expect(evidence.placeGroups?.map((group) => group.places[0]?.name)).toEqual(["Damas", "Museum of Fine Arts"]);
  });

  it("collects web sources and isolates a failed provider", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    process.env.TAVILY_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) =>
      url.includes("tavily")
        ? Promise.resolve(new Response(JSON.stringify({ results: [{ title: "Guide", url: "https://guide.example", content: "x" }] }), { status: 200 }))
        : Promise.reject(new Error("network"))));
    const evidence = await retrieveEvidence([
      { tool: "search_places", query: "retrieve-temples", location: "Amritsar" },
      { tool: "research_web", query: "what is Amritsar known for" },
    ]);
    expect(evidence.sources).toMatchObject([{ url: "https://guide.example" }]);
    expect(evidence.places).toEqual([]);
    expect(evidence.unavailableProviders).toContain("google-places");
  });

  it("pilots Exa for research_web when EXA_API_KEY is set, instead of Tavily (Phase 5)", async () => {
    process.env.EXA_API_KEY = "k";
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      results: [{ title: "Exa Guide", url: "https://exa.example", text: "y" }],
    }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const evidence = await retrieveEvidence([{ tool: "research_web", query: "what is Amritsar known for" }]);
    expect(evidence.sources).toMatchObject([{ title: "Exa Guide", url: "https://exa.example" }]);
    expect(fetchMock.mock.calls[0][0]).toContain("api.exa.ai");
  });

  it("falls back to Tavily when EXA_API_KEY is not set", async () => {
    process.env.TAVILY_API_KEY = "k";
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      results: [{ title: "Tavily Guide", url: "https://tavily.example", content: "y" }],
    }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const evidence = await retrieveEvidence([{ tool: "research_web", query: "what is Amritsar known for" }]);
    expect(evidence.sources).toMatchObject([{ title: "Tavily Guide", url: "https://tavily.example" }]);
    expect(fetchMock.mock.calls[0][0]).toContain("api.tavily.com");
  });

  it("drops places matching a stated dislike, including singular/plural forms", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    // A fresh Response per call — a shared instance's body can only be read once, and this
    // handler now makes two calls (geocode, then the biased search; see search-places.ts).
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ places: [
      { id: "m1", displayName: { text: "Carmo Archaeological Museum" }, location: { latitude: 1, longitude: 1 } },
      { id: "m2", displayName: { text: "Ajuda Palace" }, primaryType: "museum", location: { latitude: 1, longitude: 1 } },
      { id: "b", displayName: { text: "Riverside Bar" }, primaryType: "bar", location: { latitude: 1, longitude: 1 } },
    ] }), { status: 200 }))));
    // dislike stated as the plural "museums"
    const evidence = await retrieveEvidence([{ tool: "search_places", query: "retrieve-historic", location: "Lisbon" }], { dislikes: ["museums"] });
    expect(evidence.places.map((place) => place.name)).toEqual(["Riverside Bar"]);
  });

  it("drops a lodging listing from a place search — a short-term rental can SEO-match a venue query but isn't one to visit", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ places: [
      { id: "l1", displayName: { text: "Montreal Nightlife with Sophistication Style - Newly Renovated Downtown Plateau" }, primaryType: "lodging", location: { latitude: 1, longitude: 1 } },
      { id: "n1", displayName: { text: "Le Nightclub" }, primaryType: "night_club", location: { latitude: 1, longitude: 1 } },
    ] }), { status: 200 }))));
    const evidence = await retrieveEvidence([{ tool: "search_places", query: "nightlife", location: "Montreal" }]);
    expect(evidence.places.map((place) => place.name)).toEqual(["Le Nightclub"]);
  });

  it("drops a place confirmed NOT accessible when the trip states an accessibility need, but keeps an unconfirmed one", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("searchText")) {
        return Promise.resolve(new Response(JSON.stringify({ places: [
          { id: "a1", displayName: { text: "Step-Free Cafe" }, location: { latitude: 1, longitude: 1 } },
          { id: "a2", displayName: { text: "Stairs-Only Bistro" }, location: { latitude: 1, longitude: 1 } },
          { id: "a3", displayName: { text: "Unconfirmed Diner" }, location: { latitude: 1, longitude: 1 } },
        ] }), { status: 200 }));
      }
      if (url.includes("/places/a1")) return Promise.resolve(new Response(JSON.stringify({ accessibilityOptions: { wheelchairAccessibleEntrance: true } }), { status: 200 }));
      if (url.includes("/places/a2")) return Promise.resolve(new Response(JSON.stringify({ accessibilityOptions: { wheelchairAccessibleEntrance: false } }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 })); // a3: nothing recorded either way
    }));
    const evidence = await retrieveEvidence(
      [{ tool: "search_places", query: "retrieve-cafes", location: "Lisbon" }],
      { accessibilityNeeds: ["wheelchair accessible"] },
    );
    const names = evidence.places.map((place) => place.name);
    expect(names).toEqual(expect.arrayContaining(["Step-Free Cafe", "Unconfirmed Diner"]));
    expect(names).not.toContain("Stairs-Only Bistro");
  });

  it("drops places the trip has already rejected, by exact name only", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    // A fresh Response per call — a shared instance's body can only be read once, and this
    // handler now makes two calls (geocode, then the biased search; see search-places.ts).
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ places: [
      { id: "r1", displayName: { text: "Hard Rock Cafe" }, primaryType: "cafe", location: { latitude: 1, longitude: 1 } },
      { id: "r2", displayName: { text: "A Brasileira" }, primaryType: "cafe", location: { latitude: 1, longitude: 1 } },
    ] }), { status: 200 }))));
    const evidence = await retrieveEvidence(
      [{ tool: "search_places", query: "retrieve-cafes", location: "Lisbon" }],
      { excludeNames: ["hard rock cafe"] },
    );
    // The rejected name is gone; other cafés are untouched.
    expect(evidence.places.map((place) => place.name)).toEqual(["A Brasileira"]);
  });

  it("prices hotel rooms for the trip's actual party size instead of a 2-adult default", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "g";
    process.env.CONNECT_API_KEY = "sand_x";
    let ratesBody: { occupancies?: Array<{ adults: number }> } | undefined;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      if (url.includes("places.googleapis.com")) return Promise.resolve(new Response(JSON.stringify({ places: [{ id: "g1", displayName: { text: "Lisbon" }, location: { latitude: 38.72, longitude: -9.14 } }] }), { status: 200 }));
      if (url.includes("/data/hotels")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "h1", name: "Hotel Alfama", city: "Lisbon", latitude: 38.71, longitude: -9.13 }] }), { status: 200 }));
      if (url.includes("/hotels/rates") && init?.method === "POST") {
        ratesBody = JSON.parse(init.body!);
        return Promise.resolve(new Response(JSON.stringify({ data: [{ hotelId: "h1", roomTypes: [{ offerRetailRate: { amount: 360, currency: "EUR" }, rates: [{ name: "Double", boardName: "Breakfast", cancellationPolicies: { refundableTag: "RFN" } }] }] }] }), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    }));
    await retrieveEvidence([{ tool: "stays", location: "Lisbon", checkin: null, checkout: null, hotelName: null }], { travelers: 5 });
    // 5 adults spread across the default single room, not the LiteAPI client's own 2-adult default.
    expect(ratesBody?.occupancies).toEqual([{ adults: 5 }]);
  });

  it("falls back to web research when a transit directions call returns nothing", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    process.env.TAVILY_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) =>
      url.includes("routes.googleapis.com")
        ? Promise.resolve(new Response(JSON.stringify({ routes: [] }), { status: 200 }))
        : Promise.resolve(new Response(JSON.stringify({ results: [{ title: "Shinkansen guide", url: "https://rail.example", content: "Tokyo to Kyoto ~2h20" }] }), { status: 200 }))));
    const evidence = await retrieveEvidence([{ tool: "directions", from: "Tokyo", to: "Kyoto", mode: "transit" }]);
    expect(evidence.routes).toEqual([]);
    expect(evidence.sources).toMatchObject([{ url: "https://rail.example" }]);
  });

  it("merges Ticketmaster and Eventbrite results into structured events", async () => {
    process.env.TICKETMASTER_CONSUMER_KEY = "tm-key";
    process.env.EVENTBRITE_API_KEY = "eb-key";
    process.env.GOOGLE_MAPS_API_KEY = "g-key";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("ticketmaster")) return Promise.resolve(new Response(JSON.stringify({ _embedded: { events: [
        { name: "Jazz Fest", url: "https://tm.example/jazz", dates: { start: { localDate: "2026-09-12" } }, _embedded: { venues: [{ name: "Blue Note", city: { name: "Lisbon" } }] } },
      ] } }), { status: 200 }));
      if (url.includes("eventbriteapi")) return Promise.resolve(new Response(JSON.stringify({ events: { results: [
        { name: "Indie Night", url: "https://eb.example/indie", start_date: "2026-09-15", primary_venue: { name: "MusicBox" } },
      ] } }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ places: [{ id: "p", displayName: { text: "Lisbon" }, location: { latitude: 38.7, longitude: -9.1 } }] }), { status: 200 }));
    }));
    const evidence = await retrieveEvidence([{ tool: "events", query: "music", location: "Lisbon", artist: null, category: null, dateScoped: null }]);
    expect(evidence.events.map((e) => `${e.source}:${e.title}`)).toEqual(["ticketmaster:Jazz Fest", "eventbrite:Indie Night"]);
    expect(evidence.events[1]).toMatchObject({ date: "2026-09-15", venue: "MusicBox", url: "https://eb.example/indie" });
  });

  it("date-scopes events to a buffer around the trip and tags each one's relation to it", async () => {
    process.env.TICKETMASTER_CONSUMER_KEY = "tm";
    let tmUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown) => {
      tmUrl = String(input);
      return Promise.resolve(new Response(JSON.stringify({ _embedded: { events: [
        { name: "In-Trip Gig", url: "https://tm/1", dates: { start: { localDate: "2026-10-28" } }, _embedded: { venues: [{ name: "V1" }] } },
        { name: "Just After", url: "https://tm/2", dates: { start: { localDate: "2026-11-04" } }, _embedded: { venues: [{ name: "V2" }] } },
        { name: "Way Off (April)", url: "https://tm/3", dates: { start: { localDate: "2027-04-10" } }, _embedded: { venues: [{ name: "V3" }] } },
      ] } }), { status: 200 }));
    }));
    const evidence = await retrieveEvidence(
      [{ tool: "events", query: "concerts", location: "Montreal", artist: null, category: null, dateScoped: null }],
      { tripStart: "2026-10-26", tripEnd: "2026-11-01" },
    );
    // Ticketmaster was queried for the buffered window (trip ± 14d), not the exact dates.
    expect(tmUrl).toContain("startDateTime=2026-10-12");
    expect(tmUrl).toContain("endDateTime=2026-11-15");
    // The April show is outside the buffer -> gone. The other two are tagged.
    expect(evidence.events.map((e) => [e.title, e.relToTrip, e.offsetDays])).toEqual([
      ["In-Trip Gig", "in", 0],
      ["Just After", "after", 3],
    ]);
  });

  it("a named-artist events call shows only that artist, with a wider buffer", async () => {
    process.env.TICKETMASTER_CONSUMER_KEY = "tm";
    let tmUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown) => {
      tmUrl = String(input);
      return Promise.resolve(new Response(JSON.stringify({ _embedded: { events: [
        { name: "Bruno Mars", url: "https://tm/a", dates: { start: { localDate: "2026-10-29" } }, _embedded: { venues: [{ name: "Bell" }] } },
        { name: "Bruno Mars", url: "https://tm/b", dates: { start: { localDate: "2026-10-31" } }, _embedded: { venues: [{ name: "Bell" }] } },
        { name: "Some Other Band", url: "https://tm/c", dates: { start: { localDate: "2026-10-30" } }, _embedded: { venues: [{ name: "MTelus" }] } },
      ] } }), { status: 200 }));
    }));
    const evidence = await retrieveEvidence(
      [{ tool: "events", query: "is Bruno Mars playing", location: "Montreal", artist: "Bruno Mars", category: null, dateScoped: null }],
      { tripStart: "2026-10-26", tripEnd: "2026-11-01" },
    );
    expect(tmUrl).toContain("keyword=Bruno+Mars");
    expect(tmUrl).toContain("startDateTime=2026-09-26"); // trip ± 30d
    expect(evidence.events.map((e) => e.title)).toEqual(["Bruno Mars", "Bruno Mars"]); // "Some Other Band" filtered out
  });

  it("orders a broad 'what's on' list by pull (bigger acts first) and asks Ticketmaster for relevance", async () => {
    process.env.TICKETMASTER_CONSUMER_KEY = "tm";
    let tmUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown) => {
      tmUrl = String(input);
      return Promise.resolve(new Response(JSON.stringify({ _embedded: { events: [
        { name: "Open Mic Night", url: "https://tm/1", dates: { start: { localDate: "2026-10-27" } }, _embedded: { venues: [{ name: "Cafe" }] } },
        { name: "Headliner Tour", url: "https://tm/2", dates: { start: { localDate: "2026-10-30" } }, images: [{ url: "https://img/h.jpg" }], _embedded: { venues: [{ name: "Arena" }] } },
      ] } }), { status: 200 }));
    }));
    const evidence = await retrieveEvidence(
      [{ tool: "events", query: "any events happening this weekend", location: "Montreal", artist: null, category: null, dateScoped: null }],
      { tripStart: "2026-10-26", tripEnd: "2026-11-01" },
    );
    expect(tmUrl).toContain("sort=relevance%2Cdesc");
    expect(evidence.events.map((e) => e.title)).toEqual(["Headliner Tour", "Open Mic Night"]);
  });

  it("near-misses order by closeness to the trip — a show just before beats one further after", async () => {
    process.env.TICKETMASTER_CONSUMER_KEY = "tm";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ _embedded: { events: [
      { name: "Five After", url: "https://tm/a", dates: { start: { localDate: "2026-11-06" } }, _embedded: { venues: [{ name: "V" }] } },
      { name: "Two Before", url: "https://tm/b", dates: { start: { localDate: "2026-10-24" } }, _embedded: { venues: [{ name: "V" }] } },
      { name: "Three After", url: "https://tm/c", dates: { start: { localDate: "2026-11-04" } }, _embedded: { venues: [{ name: "V" }] } },
    ] } }), { status: 200 })));
    const evidence = await retrieveEvidence(
      [{ tool: "events", query: "concerts", location: "Montreal", artist: null, category: null, dateScoped: null }],
      { tripStart: "2026-10-26", tripEnd: "2026-11-01" },
    );
    // before-group ahead of after-group; within a group, smaller offset first.
    expect(evidence.events.map((e) => [e.title, e.relToTrip, e.offsetDays])).toEqual([
      ["Two Before", "before", 2],
      ["Three After", "after", 3],
      ["Five After", "after", 5],
    ]);
  });

  const undatedBody = () => JSON.stringify({ _embedded: { events: [
    { name: "Dated Gig", url: "https://tm/1", dates: { start: { localDate: "2026-10-29" } }, _embedded: { venues: [{ name: "V" }] } },
    { name: "No Date Listed", url: "https://tm/2", _embedded: { venues: [{ name: "V" }] } },
  ] } });

  it("drops an undated event on a date-scoped turn — it can't be placed against the trip", async () => {
    process.env.TICKETMASTER_CONSUMER_KEY = "tm";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(undatedBody(), { status: 200 })));
    const evidence = await retrieveEvidence(
      [{ tool: "events", query: "jazz", location: "Montreal", artist: null, category: null, dateScoped: null }],
      { tripStart: "2026-10-26", tripEnd: "2026-11-01" },
    );
    expect(evidence.events.map((e) => e.title)).toEqual(["Dated Gig"]);
  });

  it("keeps an undated event when the events turn isn't date-scoped", async () => {
    process.env.TICKETMASTER_CONSUMER_KEY = "tm";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(undatedBody(), { status: 200 })));
    const evidence = await retrieveEvidence(
      [{ tool: "events", query: "jazz", location: "Montreal", artist: null, category: null, dateScoped: false }],
      { tripStart: "2026-10-26", tripEnd: "2026-11-01" },
    );
    expect(evidence.events.map((e) => e.title).sort()).toEqual(["Dated Gig", "No Date Listed"]);
  });

  it("isolates a Ticketmaster failure without losing Eventbrite's events", async () => {
    process.env.TICKETMASTER_CONSUMER_KEY = "tm";
    process.env.EVENTBRITE_API_KEY = "eb";
    process.env.GOOGLE_MAPS_API_KEY = "g"; // eventbrite needs a geocoded point
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("places.googleapis.com")) return Promise.resolve(new Response(JSON.stringify({ places: [{ id: "g1", displayName: { text: "Montreal" }, location: { latitude: 45.5, longitude: -73.6 } }] }), { status: 200 }));
      if (url.includes("app.ticketmaster.com")) return Promise.reject(new Error("ticketmaster 500"));
      return Promise.resolve(new Response(JSON.stringify({ events: { results: [
        { name: "Local Market", url: "https://eb/1", start_date: "2026-10-29", primary_venue: { name: "Square" } },
      ] } }), { status: 200 }));
    }));
    const evidence = await retrieveEvidence(
      [{ tool: "events", query: "anything happening", location: "Montreal", artist: null, category: null, dateScoped: null }],
      { tripStart: "2026-10-26", tripEnd: "2026-11-01" },
    );
    expect(evidence.events.map((e) => e.title)).toEqual(["Local Market"]);
    expect(evidence.unavailableProviders).toContain("ticketmaster");
  });

  it("resolves a weather tool call into a forecast summary, self-geocoding the place name", async () => {
    process.env.OPENWEATHER_API_KEY = "ow";
    let geoUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("/geo/1.0/direct")) { geoUrl = url; return Promise.resolve(new Response(JSON.stringify([{ name: "Porto", lat: 41.15, lon: -8.61 }]), { status: 200 })); }
      return Promise.resolve(new Response(JSON.stringify({ city: { name: "Porto", timezone: 0 }, list: [
        { dt: 1_760_000_000, main: { temp: 18, temp_min: 14, temp_max: 21 }, weather: [{ main: "Rain", description: "light rain" }], rain: {} },
      ] }), { status: 200 }));
    }));
    const evidence = await retrieveEvidence([{ tool: "weather", location: "Porto weather uniq" }]);
    expect(geoUrl).toContain("q=Porto%20weather%20uniq");
    expect(evidence.weather).toMatch(/18°C now/);
    expect(evidence.weather).toMatch(/wet/);
    expect(evidence.unavailableProviders).not.toContain("openweather");
  });

  it("pilots Google Weather when GOOGLE_WEATHER_API_KEY is set, instead of OpenWeather (Phase 5)", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "gk"; // Google Weather geocodes via GooglePlacesProvider
    process.env.GOOGLE_WEATHER_API_KEY = "wk";
    const fetchMock = vi.fn().mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("weather.googleapis.com")) {
        return Promise.resolve(new Response(JSON.stringify({
          forecastDays: [{
            displayDate: { year: 2026, month: 10, day: 29 },
            maxTemperature: { degrees: 22 },
            minTemperature: { degrees: 12 },
            daytimeForecast: { weatherCondition: { type: "RAIN", description: { text: "Rain" } } },
          }],
        }), { status: 200 }));
      }
      // GooglePlacesProvider.search() geocode
      return Promise.resolve(new Response(JSON.stringify({ places: [{ id: "p1", displayName: { text: "Porto" }, location: { latitude: 41.15, longitude: -8.61 } }] }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const evidence = await retrieveEvidence([{ tool: "weather", location: "Porto google-weather uniq" }]);
    expect(evidence.weather).toMatch(/12–22°C rain \(wet\)/);
    expect(evidence.unavailableProviders).not.toContain("google-weather");
  });

  it("isolates an OpenWeather forecast failure — weather stays null, flagged unavailable", async () => {
    process.env.OPENWEATHER_API_KEY = "ow";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("/geo/1.0/direct")) return Promise.resolve(new Response(JSON.stringify([{ name: "Split", lat: 43.5, lon: 16.4 }]), { status: 200 }));
      return Promise.resolve(new Response("nope", { status: 500 }));
    }));
    const evidence = await retrieveEvidence([{ tool: "weather", location: "Split forecast uniq" }]);
    expect(evidence.weather).toBeNull();
    expect(evidence.unavailableProviders).toContain("openweather");
  });

  it("skips events entirely when no event provider is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const evidence = await retrieveEvidence([{ tool: "events", query: "jazz", location: "Lisbon", artist: null, category: null, dateScoped: null }]);
    expect(evidence.events).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves a flights tool call into cheapest-first offers with an assumed date", async () => {
    process.env.DUFFEL_API_KEY = "duffel_test_x";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown, init?: { method?: string }) => {
      const url = String(input);
      if (url.includes("/places/suggestions")) {
        const code = url.includes("Toronto") ? "YTO" : "LON";
        return Promise.resolve(new Response(JSON.stringify({ data: [{ type: "city", iata_code: code }] }), { status: 200 }));
      }
      if (url.includes("/air/offer_requests") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ data: { id: "orq_1" } }), { status: 200 }));
      }
      if (url.includes("/air/offers")) {
        return Promise.resolve(new Response(JSON.stringify({ data: [
          { total_amount: "640.20", total_currency: "CAD", owner: { name: "WestJet" }, slices: [{ duration: "PT7H55M", segments: [{ departing_at: "2026-10-13T20:00:00", arriving_at: "2026-10-14T08:55:00" }] }] },
        ] }), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    }));
    const evidence = await retrieveEvidence([{ tool: "flights", origin: "Toronto", destination: "London", departureDate: null, returnDate: null }]);
    expect(evidence.flights).toHaveLength(1);
    expect(evidence.flights[0]).toMatchObject({ origin: "Toronto", destination: "London", assumedDate: true });
    expect(evidence.flights[0].departureDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(evidence.flights[0].offers[0]).toMatchObject({ airline: "WestJet", priceAmount: "640.20", priceCurrency: "CAD", stops: 0, durationMinutes: 475 });
  });

  it("treats a past departure date from the model as an assumed future date", async () => {
    process.env.DUFFEL_API_KEY = "duffel_test_x";
    let sentDate = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      if (url.includes("/places/suggestions")) return Promise.resolve(new Response(JSON.stringify({ data: [{ type: "city", iata_code: "XXX" }] }), { status: 200 }));
      if (url.includes("/air/offer_requests") && init?.method === "POST") {
        sentDate = JSON.parse(init.body!).data.slices[0].departure_date;
        return Promise.resolve(new Response(JSON.stringify({ data: { id: "orq_1" } }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: [
        { total_amount: "500.00", total_currency: "USD", owner: { name: "X" }, slices: [{ duration: "PT8H", segments: [{ departing_at: "a", arriving_at: "b" }] }] },
      ] }), { status: 200 }));
    }));
    const evidence = await retrieveEvidence([{ tool: "flights", origin: "A", destination: "B", departureDate: "2024-11-17", returnDate: null }]);
    expect(evidence.flights[0].assumedDate).toBe(true);
    expect(sentDate > new Date().toISOString().slice(0, 10)).toBe(true);
  });

  it("skips flights when DUFFEL_API_KEY is not set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const evidence = await retrieveEvidence([{ tool: "flights", origin: "Toronto", destination: "London", departureDate: null, returnDate: null }]);
    expect(evidence.flights).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("geocodes a stays location, prices hotels, and flags example dates", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "g";
    process.env.CONNECT_API_KEY = "sand_x";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown, init?: { method?: string }) => {
      const url = String(input);
      if (url.includes("places.googleapis.com")) return Promise.resolve(new Response(JSON.stringify({ places: [{ id: "g1", displayName: { text: "Lisbon" }, location: { latitude: 38.72, longitude: -9.14 } }] }), { status: 200 }));
      if (url.includes("/data/hotels")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "h1", name: "Hotel Alfama", city: "Lisbon", latitude: 38.71, longitude: -9.13, stars: 4, rating: 8.6, reviewCount: 900, thumbnail: "https://img/h1.jpg" }] }), { status: 200 }));
      if (url.includes("/hotels/rates") && init?.method === "POST") return Promise.resolve(new Response(JSON.stringify({ data: [{ hotelId: "h1", roomTypes: [{ offerRetailRate: { amount: 360, currency: "EUR" }, rates: [{ name: "Double", boardName: "Breakfast", cancellationPolicies: { refundableTag: "RFN" } }] }] }] }), { status: 200 }));
      return Promise.reject(new Error(`unexpected ${url}`));
    }));
    const evidence = await retrieveEvidence([{ tool: "stays", location: "Lisbon", checkin: null, checkout: null, hotelName: null }]);
    expect(evidence.stays).toHaveLength(1);
    expect(evidence.stays[0]).toMatchObject({ location: "Lisbon", nights: 3, assumedDates: true });
    expect(evidence.stays[0].checkin).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(evidence.stays[0].options[0]).toMatchObject({ name: "Hotel Alfama", nightlyAmount: 120, currency: "EUR" });
  });

  it("attaches a room breakdown when the stays call names a hotel", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "g";
    process.env.CONNECT_API_KEY = "sand_x";
    let ratesCalls = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: unknown, init?: { method?: string }) => {
      const url = String(input);
      if (url.includes("places.googleapis.com")) return Promise.resolve(new Response(JSON.stringify({ places: [{ id: "g1", displayName: { text: "Lisbon" }, location: { latitude: 38.72, longitude: -9.14 } }] }), { status: 200 }));
      if (url.includes("/data/hotels")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "h1", name: "Torel Palace", city: "Lisbon", latitude: 38.71, longitude: -9.13, stars: 5, rating: 9.4, reviewCount: 1200 }] }), { status: 200 }));
      if (url.includes("/hotels/rates") && init?.method === "POST") {
        ratesCalls += 1;
        return Promise.resolve(new Response(JSON.stringify({ data: [{ hotelId: "h1", roomTypes: [
          { offerRetailRate: { amount: 690, currency: "EUR" }, rates: [{ name: "Deluxe", boardName: "Breakfast", cancellationPolicies: { refundableTag: "RFN" } }] },
          { offerRetailRate: { amount: 900, currency: "EUR" }, rates: [{ name: "Suite", boardName: "Room Only", cancellationPolicies: { refundableTag: "NRFN" } }] },
        ] }] }), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    }));
    const evidence = await retrieveEvidence([{ tool: "stays", location: "Lisbon", hotelName: "torel", checkin: null, checkout: null }]);
    expect(ratesCalls).toBe(1); // rooms come from the search response — no second rates call
    expect(evidence.stays[0].detail).toMatchObject({ hotelName: "Torel Palace" });
    expect(evidence.stays[0].detail!.rooms.map((r) => r.name)).toEqual(["Deluxe", "Suite"]);
  });

  it("skips stays when no LiteAPI key is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const evidence = await retrieveEvidence([{ tool: "stays", location: "Lisbon", checkin: null, checkout: null, hotelName: null }]);
    expect(evidence.stays).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates caller abort instead of marking a provider unavailable", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));
    await expect(retrieveEvidence([{ tool: "search_places", query: "retrieve-abort", location: "y" }], {}, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
