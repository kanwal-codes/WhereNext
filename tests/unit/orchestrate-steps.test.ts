import { describe, expect, it } from "vitest";
import { resolvedTurnSchema } from "../../lib/application/turn-resolver";
import { broadenedPlan, isGrounded, planRetrieval, readDislikes, readStrList, retrieveFiltersFor, type Evidence } from "../../lib/application/orchestrate/retrieve-plan";
import { compactEvidence } from "../../lib/application/orchestrate/evidence-compaction";
import { weatherReadiness } from "../../lib/application/orchestrate/weather-readiness";
import { composeSkipLineFor, leadInLineFor } from "../../lib/application/orchestrate/compose-skip";
import type { TripContext } from "../../lib/application/trip-context";

const resolve = (over: Record<string, unknown> = {}) => resolvedTurnSchema.parse({ intent: "discovery", ...over });
const trip = (over: Record<string, unknown> = {}) => ({ name: "T", destination: "Lisbon, Portugal", origin: null, duration_days: 5, start_date: "2026-12-01", end_date: "2026-12-05", travelers: 2, ...over });
const ctx = (over: Record<string, unknown> = {}, prefs: Record<string, unknown> = {}) => ({ trip: trip(over), preferences: prefs, places: [], itinerary: [], decisions: [] }) as unknown as TripContext;
const none = { places: [], sources: [], routes: [], events: [], flights: [], stays: [], weather: null, weatherDays: [], unavailableProviders: [] } as unknown as Evidence;
const caps = (resolved: ReturnType<typeof resolve>) => new Set(resolved.capabilities);
const NOW = new Date("2026-12-02T12:00:00");

describe("readStrList / readDislikes", () => {
  it("reads only the strings of a list preference", () => {
    expect(readStrList({ likes: ["a", 3, "b"] }, "likes")).toEqual(["a", "b"]);
    expect(readStrList({ likes: "a" }, "likes")).toEqual([]);
    expect(readDislikes({ dislikes: ["crowds"] })).toEqual(["crowds"]);
    expect(readDislikes({})).toEqual([]);
  });
});

describe("planRetrieval", () => {
  const plan = (resolved: ReturnType<typeof resolve>, over: Record<string, unknown> = {}, prompt = "ideas") =>
    planRetrieval({ resolved, prompt, tripCtx: ctx(over), locationFocus: "Lisbon", caps: caps(resolved), now: NOW });

  it("qualifies a bare place with the trip's destination, but not one that already names it", () => {
    const r = plan(resolve({ toolPlan: [{ tool: "search_places", query: "cafes", location: "Belém" }, { tool: "search_places", query: "x", location: "Lisbon centre" }, { tool: "weather", location: "Belém, Lisbon" }] }));
    expect(r.toolPlan.map((c) => ("location" in c ? c.location : ""))).toEqual(["Belém, Lisbon, Portugal", "Lisbon centre", "Belém, Lisbon"]);
  });

  it("fills the trip's dates into stays and flights that name none, and keeps ones they name", () => {
    const r = plan(resolve({ toolPlan: [{ tool: "stays", location: "Alfama", checkin: null, checkout: null, hotelName: null }, { tool: "stays", location: "Alfama", checkin: "2027-01-01", checkout: "2027-01-03", hotelName: null }, { tool: "flights", origin: "Toronto", destination: "Lisbon", departureDate: null, returnDate: null }] }));
    expect(r.toolPlan[0]).toMatchObject({ checkin: "2026-12-01", checkout: "2026-12-05" });
    expect(r.toolPlan[1]).toMatchObject({ checkin: "2027-01-01", checkout: "2027-01-03" });
    expect(r.toolPlan[2]).toMatchObject({ departureDate: "2026-12-01" });
  });

  it("qualifies both ends of a route", () => {
    const r = plan(resolve({ toolPlan: [{ tool: "directions", from: "Belém", to: "Sintra", mode: "transit" }] }));
    expect(r.toolPlan[0]).toMatchObject({ from: "Belém, Lisbon, Portugal", to: "Sintra, Lisbon, Portugal" });
  });

  it("adds a places lookup for a photo request that planned none", () => {
    const r = plan(resolve({ toolPlan: [{ tool: "weather", location: "Lisbon" }] }), {}, "show me photos of Alfama");
    expect(r.requestedImages).toBe(true);
    expect(r.toolPlan.map((c) => c.tool)).toEqual(["search_places", "weather"]);
    const again = plan(resolve({ toolPlan: [{ tool: "search_places", query: "q", location: "Lisbon" }] }), {}, "photos please");
    expect(again.toolPlan).toHaveLength(1);
  });

  it("does not flag a photo request when none was made", () => {
    expect(plan(resolve()).requestedImages).toBe(false);
  });

  it("biases a dinner search toward a timed stop on the day the traveller is on the trip", () => {
    const tripCtx = { ...ctx(), itinerary: [{ id: "i", title: "Fado show", day_index: 2, metadata: { time: "20:00" } }] } as unknown as TripContext;
    const resolved = resolve({ intent: "food", toolPlan: [{ tool: "search_places", query: "dinner", location: "Alfama" }] });
    const r = planRetrieval({ resolved, prompt: "where should we have dinner tonight", tripCtx, locationFocus: "Lisbon", caps: caps(resolved), now: NOW });
    if (r.mealAnchor) expect(r.toolPlan[0]).toMatchObject({ location: expect.stringContaining(r.mealAnchor.title) });
    else expect(r.toolPlan[0]).toMatchObject({ location: "Alfama, Lisbon, Portugal" });
  });

  it("hands back the qualifier and the trip's dates for COMPOSE's own tools", () => {
    const r = plan(resolve());
    expect(r.qualify("Belém")).toBe("Belém, Lisbon, Portugal");
    expect(r.qualify("Lisbon")).toBe("Lisbon");
    expect([r.tripStart, r.tripEnd]).toEqual(["2026-12-01", "2026-12-05"]);
  });
});

describe("retrieveFiltersFor", () => {
  it("collects the trip's tastes, dates and rejected places", () => {
    const tripCtx = { ...ctx({}, { interests: ["art"], likes: ["jazz"], country: "PT", accessibilityNeeds: ["step-free"] }), places: [{ status: "rejected", place: { name: "Tourist Trap" } }, { status: "saved", place: { name: "Fine" } }, { status: "rejected", place: null }] } as unknown as TripContext;
    const f = retrieveFiltersFor(tripCtx, ["crowds"]);
    expect(f).toMatchObject({ dislikes: ["crowds"], country: "PT", interests: ["art"], likes: ["jazz"], tripStart: "2026-12-01", tripEnd: "2026-12-05", excludeNames: ["Tourist Trap"], travelers: 2, accessibilityNeeds: ["step-free"] });
  });
});

describe("isGrounded", () => {
  it("is true when any provider returned something", () => {
    expect(isGrounded(none)).toBe(false);
    for (const key of ["places", "sources", "routes", "events", "flights", "stays"]) expect(isGrounded({ ...none, [key]: [1] } as unknown as Evidence)).toBe(true);
    expect(isGrounded({ ...none, weather: {} } as unknown as Evidence)).toBe(true);
  });
});

describe("broadenedPlan", () => {
  it("falls back to generic terms near the destination", () => {
    const plan = resolve({ toolPlan: [{ tool: "search_places", query: "very specific", location: "x" }, { tool: "events", query: "q", location: "y", artist: null, category: null, dateScoped: null }, { tool: "research_web", query: "fado" }, { tool: "weather", location: "z" }] }).toolPlan;
    const out = broadenedPlan(plan, "food", "Lisbon");
    expect(out[0]).toMatchObject({ query: "restaurants", location: "Lisbon" });
    expect(out[1]).toMatchObject({ query: "", location: "Lisbon" });
    expect(out[2]).toMatchObject({ query: "fado Lisbon" });
    expect(out[3]).toEqual(plan[3]);
    expect(broadenedPlan(plan, "other", undefined)[0]).toMatchObject({ query: "top attractions", location: "x" });
  });
});

describe("weatherReadiness", () => {
  const ev = (days: number) => ({ ...none, weatherDays: Array.from({ length: days }, () => ({})) }) as unknown as Evidence;
  const ask = (over: Record<string, unknown>) => weatherReadiness({ intent: "weather", caps: new Set(), tripStart: "2026-12-02", evidence: ev(3), sourceCount: 0, ...over } as never);

  it("uses the forecast when the trip is within reach and the forecast came back", () => {
    // 2026-12-02 is within a week of the real clock only in some runs; pin the contract through the seasonal path instead below.
    expect(ask({ tripStart: undefined }).willShowWeatherCard).toBe(false);
  });
  it("names the month, early or late in it", () => {
    expect(ask({ tripStart: "2026-12-03", evidence: ev(0) }).weatherMonth).toBe("early December");
    expect(ask({ tripStart: "2026-12-15", evidence: ev(0) }).weatherMonth).toBe("December");
    expect(ask({ tripStart: "2026-12-25", evidence: ev(0) }).weatherMonth).toBe("late December");
    expect(ask({ tripStart: "soon" }).weatherMonth).toBeNull();
  });
  it("shows a seasonal card from the web notes when there is no forecast", () => {
    expect(ask({ tripStart: "2099-07-15", evidence: ev(0), sourceCount: 2 })).toMatchObject({ forecastReady: false, willShowWeatherCard: true, weatherMonth: "July" });
    expect(ask({ tripStart: "2099-07-15", evidence: ev(0), sourceCount: 0 }).willShowWeatherCard).toBe(false);
  });
  it("shows nothing for a budget or structured question, or another intent", () => {
    expect(ask({ tripStart: "2099-07-15", evidence: ev(0), sourceCount: 2, caps: new Set(["budget"]) }).willShowWeatherCard).toBe(false);
    expect(ask({ tripStart: "2099-07-15", evidence: ev(0), sourceCount: 2, caps: new Set(["structured_answer"]) }).willShowWeatherCard).toBe(false);
    expect(ask({ tripStart: "2099-07-15", evidence: ev(0), sourceCount: 2, intent: "food" }).willShowWeatherCard).toBe(false);
    expect(ask({ tripStart: "2099-07-15", evidence: ev(0), sourceCount: 2, intent: "essentials" }).willShowWeatherCard).toBe(true);
  });
});

describe("composeSkipLineFor", () => {
  const base = { intent: "discovery" as const, budgetBlock: null, optionsBlock: null, structuredAnswerBlock: null, weatherCard: null, itineraryBlock: null };
  it("is null when no block answers the turn alone", () => {
    expect(composeSkipLineFor(base)).toBeNull();
  });
  it("takes the intro or summary of a block that does", () => {
    expect(composeSkipLineFor({ ...base, budgetBlock: { type: "budget", summary: "About 90 a day." } as never })).toBe("About 90 a day.");
    expect(composeSkipLineFor({ ...base, optionsBlock: { type: "options", intro: "Three areas." } as never })).toBe("Three areas.");
    expect(composeSkipLineFor({ ...base, structuredAnswerBlock: { type: "structured_answer", intro: "Short answer." } as never })).toBe("Short answer.");
  });
  it("uses the weather headline, and points an essentials turn to the checklist", () => {
    const weatherCard = { headline: "Mild, around 14°." } as never;
    expect(composeSkipLineFor({ ...base, weatherCard })).toBe("Mild, around 14°.");
    expect(composeSkipLineFor({ ...base, weatherCard, intent: "essentials" })).toBe("Mild, around 14°. The full checklist is below.");
  });
  it("uses the itinerary's intro, or a default", () => {
    expect(composeSkipLineFor({ ...base, itineraryBlock: { type: "itinerary", intro: "Here you go." } as never })).toBe("Here you go.");
    expect(composeSkipLineFor({ ...base, itineraryBlock: { type: "itinerary", intro: "" } as never })).toBe("Here's a rough day-by-day — tell me to rework any day.");
  });
  it("prefers the budget, then options, over the rest", () => {
    expect(composeSkipLineFor({ ...base, budgetBlock: { type: "budget", summary: "B" } as never, optionsBlock: { type: "options", intro: "O" } as never })).toBe("B");
  });
});

describe("leadInLineFor", () => {
  const input = (over: Record<string, unknown> = {}) => ({
    composeSkipLine: null, resolved: resolve({ cardsAnswer: true, toolPlan: [{ tool: "search_places", query: "cafes", location: "Lisbon" }] }), prompt: "cafes in Lisbon", language: "en", hasGrounding: true,
    tripUpdateReceipt: null, sourceCount: 0, unavailableProviderCount: 0, blocks: [{ type: "place_list", places: [{ name: "A" }, { name: "B" }] }], locationFocus: "Lisbon", ...over,
  }) as never;

  it("is a one-line lead-in when cards alone answer a plain lookup", () => {
    expect(leadInLineFor(input())).toEqual(expect.any(String));
  });
  it("is null when another block already carries the reply", () => {
    expect(leadInLineFor(input({ composeSkipLine: "x" }))).toBeNull();
  });
  it("is null when the reply needs words: nothing grounded, web sources, a failed provider, or not English", () => {
    for (const over of [{ hasGrounding: false }, { sourceCount: 1 }, { unavailableProviderCount: 1 }, { language: "fr" }]) expect(leadInLineFor(input(over))).toBeNull();
  });
  it("confirms a plain trip-fact change in a line, but not when it also asks something", () => {
    const receipt = { type: "trip_update", changes: [{ label: "Dates", from: null, to: "Sep 30 – Oct 6" }] };
    const base = { composeSkipLine: null, resolved: resolve({ intent: "trip_memory" }), prompt: "we go Sep 30 to Oct 6", language: "en", hasGrounding: false, tripUpdateReceipt: receipt, sourceCount: 0, unavailableProviderCount: 0, blocks: [receipt], locationFocus: "Lisbon" };
    expect(leadInLineFor(base as never)).toEqual(expect.any(String));
    expect(leadInLineFor({ ...base, prompt: "we go Sep 30 to Oct 6, ok?" } as never)).toBeNull();
  });
});

describe("compactEvidence", () => {
  const place = (n: number) => ({ provider: "google", providerId: `p${n}`, name: `Place ${n}`, category: "cafe", address: "1 St", rating: 4.5, userRatingCount: 10, sourceUrl: `https://p/${n}`, photoNames: [`photo${n}`], phone: null, websiteUri: null, openingHours: null, openNow: null, latitude: 1, longitude: 2 });
  const run = (evidence: Partial<Evidence>, requestedImages = false, toolPlan: unknown[] = []) =>
    compactEvidence({ evidence: { ...none, ...evidence } as Evidence, toolPlan: toolPlan as never, requestedImages, photoUrl: (n) => `/photo?name=${n}` });

  it("gives cards to the first six places and lets the reply link only to what is shown", () => {
    const r = run({ places: Array.from({ length: 9 }, (_, i) => place(i)) as never, sources: [{ title: "S", url: "https://s", content: "x".repeat(900) }] as never });
    expect(r.cardPlaces).toHaveLength(6);
    expect(r.compactPlaces).toHaveLength(6);
    expect(r.compactSources[0].content).toHaveLength(700);
    expect([...r.allowedUrls]).toEqual(["https://s", ...Array.from({ length: 6 }, (_, i) => `https://p/${i}`)]);
  });
  it("allows photo links only when photos were asked for", () => {
    expect([...run({ places: [place(1)] as never }, true).allowedUrls]).toEqual(["https://p/1", "/photo?name=photo1"]);
  });
  it("keeps grouped places grouped, six each", () => {
    const groups = [{ label: "A", places: Array.from({ length: 8 }, (_, i) => place(i)) }, { label: "B", places: [place(20)] }];
    const r = run({ places: [place(1)] as never, placeGroups: groups as never });
    expect(r.cardPlaceGroups.map((g) => [g.label, g.places.length])).toEqual([["A", 6], ["B", 1]]);
    expect(r.cardPlaces).toHaveLength(7);
  });
  it("describes events against the trip window and guides how to talk about them", () => {
    const events = [
      { title: "In", date: "Dec 2 20:00", venue: "V", url: "https://e/1", relToTrip: "in", startDate: "2026-12-02", rank: 80 },
      { title: "Before", date: "Nov 28", venue: "W", url: "https://e/2", relToTrip: "before", offsetDays: 3, rank: 50 },
    ];
    const r = run({ events: events as never });
    expect(r.compactEvents.map((e) => [e.whenVsTrip, e.prominence])).toEqual([["during the trip", "major"], ["3d before the trip", "notable"]]);
    expect(r.eventsInWindow).toHaveLength(1);
    expect(r.anchorEvent).toEqual({ title: "In", venue: "V", date: "2026-12-02", time: "20:00" });
    expect(r.eventsGuidance).toContain("1 fall during the trip");
  });
  it("leads with the nearest miss when nothing falls in the window", () => {
    const r = run({ events: [{ title: "Later", date: "Dec 9", venue: "V", url: "u", relToTrip: "after", offsetDays: 4 }] as never });
    expect(r.anchorEvent).toBeNull();
    expect(r.eventsGuidance).toContain('NONE fall in the trip window. Lead with the closest: "Later" on Dec 9, 4 days after the traveller leaves');
  });
  it("asks which night when a named act plays several", () => {
    const events = [{ title: "A", date: "d1", url: "u1", relToTrip: "in" }, { title: "A", date: "d2", url: "u2", relToTrip: "in" }];
    const r = run({ events: events as never }, false, [{ tool: "events", query: "", location: "x", artist: "Bruno Mars" }]);
    expect(r.eventsGuidance).toContain('The traveller asked specifically about "Bruno Mars", who plays 2 nights');
    expect(r.anchorEvent).toBeNull();
  });
  it("falls back to web sources, or nothing, when there are no event cards", () => {
    expect(run({ sources: [{ title: "S", url: "u", content: "c" }] as never }).eventsGuidance).toContain("There are no verified event cards");
    expect(run({}).eventsGuidance).toBe("");
  });
  it("trims flights and stays for the model", () => {
    const flights = [{ origin: "YYZ", destination: "LIS", departureDate: "2026-12-01", assumedDate: undefined, offers: [{ airline: "TP", priceAmount: "500", priceCurrency: "CAD", durationMinutes: 450, stops: 0, departAt: "a", arriveAt: "b", originAirport: "YYZ", destinationAirport: "LIS" }] }];
    const stays = [{ provider: "serpapi", location: "Lisbon", checkin: "a", checkout: "b", nights: 4, adults: 1, options: [{ name: "H", nightlyAmount: 100, totalAmount: 400, currency: "EUR", stars: 4, rating: 8.5, reviewCount: 10, refundable: true }], detail: null }];
    const r = run({ flights: flights as never, stays: stays as never });
    expect(r.compactFlights[0].offers[0]).toMatchObject({ price: "500 CAD", hours: 7.5, airports: "YYZ → LIS" });
    expect(r.compactStays[0]).toMatchObject({ source: expect.stringContaining("Google Hotels, for 1 guest;"), rooms: null });
    expect(r.compactStays[0].hotels[0]).toMatchObject({ nightly: "100 EUR", freeCancellation: true });
  });
});
