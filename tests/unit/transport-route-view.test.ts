import { describe, expect, it } from "vitest";
import {
  cheapestFlight, compareContext, describeRoutes, driveSaveValue, driveTrafficOf, fastestIndex, flightPrice, flightSaveValue, flightsStatusText, googleFlightsUrl,
  googleMapsTransitUrl, hexColor, legsFor, lyftHref, mergeWalks, money, pathOf, routeSummaries, stopsLabel, transitSaveValue, transitStatusText, uberHref,
  type DriveRoute, type Flight, type Route,
} from "../../features/transport/domain/route-view";

const flight = (over: Partial<Flight> = {}): Flight => ({
  id: "f", airline: "Air Test", priceAmount: "100", priceCurrency: "EUR", durationMinutes: 80, stops: 0, departAt: "2026-12-01T08:00:00", arriveAt: "2026-12-01T09:20:00",
  originAirport: "CDG", destinationAirport: "LYS", passengerIds: [], ...over,
});
const route = (over: Partial<Route> = {}): Route => ({
  durationSeconds: 1800, distanceMeters: 8000, departureTime: "2026-12-01T09:00:00Z", arrivalTime: "2026-12-01T09:30:00Z", timeZone: "UTC", fare: { amount: 2.5, currency: "EUR" },
  steps: [{ mode: "walk", durationSeconds: 300 }, { mode: "subway", line: "1", headsign: "La Défense", stopCount: 5, durationSeconds: 1200 }], ...over,
});

describe("small formatters", () => {
  it("writes a colour as #hex, with or without the hash", () => {
    expect([hexColor("ff0000"), hexColor("#00ff00"), hexColor(undefined)]).toEqual(["#ff0000", "#00ff00", undefined]);
  });
  it("shows a fare in its currency, or the plain amount for one the browser does not know", () => {
    expect(money({ amount: 2.5, currency: "EUR" })).toMatch(/2[.,]50/);
    expect(money({ amount: 2.5, currency: "XX" })).toBe("2.50 XX");
    expect(money(undefined)).toBeNull();
  });
  it("prices a flight with cents, falling back for an unknown currency", () => {
    expect(flightPrice(flight())).toMatch(/100/);
    expect(flightPrice(flight({ priceCurrency: "XX" }))).toBe("100 XX");
  });
  it("labels stops", () => {
    expect([0, 1, 2].map(stopsLabel)).toEqual(["non-stop", "1 stop", "2 stops"]);
  });
});

describe("route shapes", () => {
  it("paints each step that has a shape; else the whole line; else nothing", () => {
    const withShapes = route({ steps: [{ mode: "bus", color: "ff0000", polyline: [[0, 0], [1, 1]] }, { mode: "walk" }] });
    expect(legsFor(withShapes)).toEqual([{ polyline: [[0, 0], [1, 1]], mode: "bus", color: "#ff0000" }]);
    expect(legsFor(route({ steps: [], polyline: [[0, 0], [2, 2]] }))).toEqual([{ polyline: [[0, 0], [2, 2]], mode: "transit" }]);
    expect(legsFor(route({ steps: [], polyline: undefined }))).toEqual([]);
  });
  it("takes a route's own line, else joins its steps' lines", () => {
    expect(pathOf(route({ polyline: [[0, 0], [1, 1]] }))).toEqual([[0, 0], [1, 1]]);
    expect(pathOf(route({ polyline: undefined, steps: [{ polyline: [[0, 0]] }, { polyline: [[1, 1]] }] }))).toEqual([[0, 0], [1, 1]]);
  });
  it("joins back-to-back walks into one, adding their time and keeping the last stop", () => {
    const out = mergeWalks([{ mode: "walk", durationSeconds: 60, arrivalStop: "A" }, { mode: "Walk", durationSeconds: 120, arrivalStop: "B", polyline: [[1, 1]] }, { mode: "bus" }, { mode: "walk", durationSeconds: 30 }]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ durationSeconds: 180, arrivalStop: "B" });
    expect(out[2].durationSeconds).toBe(30);
  });
  it("finds the quickest route", () => {
    expect(fastestIndex([route({ durationSeconds: 900 }), route({ durationSeconds: 600 }), route({ durationSeconds: 700 })])).toBe(1);
  });
  it("counts changes and walking, and tags the best", () => {
    const { meta, tags } = routeSummaries([route({ durationSeconds: 3000 }), route({ durationSeconds: 1800 })]);
    expect(meta).toHaveLength(2);
    expect(meta[1].minutes).toBe(30);
    expect(tags[1]).toBe("fastest");
  });
});

describe("describing and saving", () => {
  it("summarises a route for the assistant", () => {
    const text = describeRoutes("Paris", "Lyon", [route()]);
    expect(text.startsWith("Ways to get from Paris to Lyon:\nOption 1: 30 min, 8.0 km")).toBe(true);
    expect(text).toContain("1 toward La Défense (5 stops)");
  });
  it("records a transit route: its first ride's mode, minutes, fare, times and a summary line", () => {
    expect(transitSaveValue(route(), "Paris", "Lyon")).toMatchObject({ mode: "subway", minutes: 30, fare: "2.5 EUR", departAt: "2026-12-01T09:00:00Z" });
    expect(transitSaveValue(route({ fare: undefined, steps: [{ mode: "walk" }] }), "A", "B")).toMatchObject({ mode: "transit", fare: null });
  });
  it("records a flight and a drive", () => {
    expect(flightSaveValue(flight(), "€100.00")).toMatchObject({ mode: "flight", airline: "Air Test", fare: "100 EUR", stops: 0, summary: "Air Test, €100.00, 1 h 20 min, non-stop" });
    expect(flightSaveValue(flight({ stops: 2 }), "x").summary).toContain("2 stop(s)");
    expect(driveSaveValue({ distanceMeters: 465000, durationSeconds: 16200, geometry: { coordinates: [] } })).toEqual({ mode: "drive", minutes: 270, km: 465, name: "Drive, 4 h 30 min" });
  });
  it("builds the context for 'compare these'", () => {
    const drive: DriveRoute = { distanceMeters: 465000, durationSeconds: 16200, geometry: { coordinates: [] } };
    const text = compareContext({ from: "Paris", to: "Lyon", when: null, returnDate: "2026-12-08", travellers: 2, routes: [route()], driveRoute: drive, flights: [flight()] });
    expect(text).toContain("Travelling leave now, returning 2026-12-08, 2 travellers.");
    expect(text).toContain("Driving: 4 h 30 min, 465.0 km.");
    expect(text).toContain("Flights from Paris to Lyon:\nOption 1: Air Test, 100 EUR, 1 h 20 min, non-stop");
    expect(compareContext({ from: "A", to: "B", when: null, returnDate: "", travellers: 1, routes: [], driveRoute: null, flights: [] })).toBe("Travelling leave now, 1 traveller.");
  });
});

describe("status lines", () => {
  it("words the transit result", () => {
    expect(transitStatusText({ ok: false, count: 0, when: null, timeIgnored: false })).toMatch(/couldn’t load routes/);
    expect(transitStatusText({ ok: true, count: 0, when: null, timeIgnored: false })).toBe("No public transit route between those two places.");
    expect(transitStatusText({ ok: true, count: 1, when: null, timeIgnored: false })).toBe("1 route");
    expect(transitStatusText({ ok: true, count: 3, when: { kind: "depart", date: "2026-12-01", time: "09:30" }, timeIgnored: false })).toMatch(/^3 routes · /);
    expect(transitStatusText({ ok: true, count: 3, when: { kind: "depart", date: "2026-12-01", time: "09:30" }, timeIgnored: true })).toBe("3 routes");
  });
  it("words the flights result", () => {
    expect(flightsStatusText({ ok: false, count: 0, assumedDate: false, travellers: 1 })).toMatch(/couldn’t load flights/);
    expect(flightsStatusText({ ok: true, count: 0, assumedDate: false, travellers: 1 })).toMatch(/No flights came back/);
    expect(flightsStatusText({ ok: true, count: 2, assumedDate: true, travellers: 3 })).toBe("2 flights · example date — pick a day above for accurate prices · prices for 3 travellers");
    expect(flightsStatusText({ ok: true, count: 1, assumedDate: false, travellers: 1 })).toBe("1 flight");
  });
});

describe("flights and links", () => {
  it("finds the cheapest flight and prices it without cents", () => {
    const cheap = cheapestFlight([flight({ id: "a", priceAmount: "180" }), flight({ id: "b", priceAmount: "95.50" })])!;
    expect(cheap.flight.id).toBe("b");
    expect(cheap.from).toMatch(/96|95/);
    expect(cheapestFlight([])).toBeNull();
    expect(cheapestFlight([flight({ priceCurrency: "XX" })])!.from).toBeNull();
  });
  it("links to Google Flights for the airports, the day and the return", () => {
    expect(decodeURIComponent(googleFlightsUrl(flight(), "2026-12-08"))).toBe("https://www.google.com/travel/flights?q=Flights from CDG to LYS on 2026-12-01 returning 2026-12-08");
    expect(decodeURIComponent(googleFlightsUrl(flight({ departAt: "" }), ""))).toBe("https://www.google.com/travel/flights?q=Flights from CDG to LYS");
  });
  it("builds the rideshare and maps links", () => {
    expect(uberHref("A b", "C")).toBe("uber://?action=setPickup&pickup[formatted_address]=A%20b&dropoff[formatted_address]=C");
    expect(lyftHref({ from: [2.35, 48.85], to: [4.83, 45.76] })).toBe("lyft://ridetype?id=lyft&pickup[latitude]=48.85&pickup[longitude]=2.35&destination[latitude]=45.76&destination[longitude]=4.83");
    expect(googleMapsTransitUrl("Paris", "Lyon")).toBe("https://www.google.com/maps/dir/?api=1&origin=Paris&destination=Lyon&travelmode=transit");
  });
});

describe("driveTrafficOf", () => {
  it("has no traffic summary without a route", () => {
    expect(driveTrafficOf(null)).toEqual({ runs: [], traffic: null });
  });
  it("merges neighbouring stretches of one colour into one bar segment", () => {
    const { traffic } = driveTrafficOf({ distanceMeters: 100_000, durationSeconds: 3600, geometry: { coordinates: [[0, 0], [0.1, 0], [0.2, 0], [0.3, 0]] }, congestion: ["low", "low", "heavy"] });
    expect(traffic).not.toBeNull();
    expect(traffic!.bar.length).toBeLessThanOrEqual(2);
    expect(traffic!.bar.reduce((a, b) => a + b.km, 0)).toBeGreaterThan(0);
  });
});
