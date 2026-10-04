import { beforeEach, describe, expect, it, vi } from "vitest";

const { guardedFetchMock } = vi.hoisted(() => ({ guardedFetchMock: vi.fn() }));
vi.mock("../../lib/server/provider-guard", () => ({ guardedFetch: guardedFetchMock }));

import { searchGoogleFlights, suggestFlightPlaces } from "../../packages/providers/serpapi/client";

const reply = (body: unknown, ok = true) => guardedFetchMock.mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
const seg = (from: string, fromTime: string, to: string, toTime: string, airline: string, no: string) => ({
  departure_airport: { id: from, time: fromTime }, arrival_airport: { id: to, time: toTime }, duration: 100, airline, flight_number: no, airplane: "Airbus A330", travel_class: "Economy", airline_logo: `https://logo/${airline}.png`,
});

beforeEach(() => {
  guardedFetchMock.mockReset();
  process.env.SERP_API_KEY = "test-key";
});

describe("suggestFlightPlaces", () => {
  it("maps Google's suggestions to cities and airports", async () => {
    reply({ suggestions: [{ name: "Toronto, Ontario, Canada", type: "city", description: "City in Ontario", id: "/m/0h7h6", airports: [{ id: "YYZ" }, { id: "YTZ" }] }, { type: "city" }] });
    expect(await suggestFlightPlaces("toronto")).toEqual([{ id: "/m/0h7h6", label: "Toronto, Ontario, Canada", detail: "City in Ontario", kind: "city", airports: ["YYZ", "YTZ"] }]);
  });
});

describe("searchGoogleFlights", () => {
  const input = { departureId: "YYZ", arrivalId: "ZAG", departureDate: "2026-11-15", returnDate: "2026-11-22", currency: "CAD" };
  it("turns Google's groups into fares in the currency asked, with the price read", async () => {
    reply({
      best_flights: [{
        flights: [seg("YYZ", "2026-11-15 16:00", "FRA", "2026-11-16 05:55", "Condor", "DE 2403"), seg("FRA", "2026-11-16 08:00", "ZAG", "2026-11-16 09:25", "Croatia Airlines", "OU 411")],
        layovers: [{ id: "FRA", duration: 125, overnight: false }], total_duration: 775, price: 970, departure_token: "tok", carbon_emissions: { this_flight: 445000, difference_percent: -2 },
      }],
      other_flights: [{ flights: [seg("YYZ", "2026-11-15 22:00", "ZAG", "2026-11-16 12:00", "Air Canada", "AC 1")], total_duration: 600, price: 1210.5 }, { flights: [] }],
      price_insights: { lowest_price: 970, price_level: "low", typical_price_range: [980, 1250] },
    });
    const { offers, insights } = await searchGoogleFlights(input);
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ airline: "Condor · Croatia Airlines", priceAmount: "970.00", priceCurrency: "CAD", stops: 1, durationMinutes: 775, departAt: "2026-11-15T16:00:00", arriveAt: "2026-11-16T09:25:00", originAirport: "YYZ", destinationAirport: "ZAG", layoverAirports: ["FRA"], departureToken: "tok", flightNumbers: ["DE 2403", "OU 411"], co2Kg: 445, co2Diff: -2 });
    // Each flight of the journey, with the wait after the first one and none after the last.
    expect(offers[0]!.legs).toHaveLength(2);
    expect(offers[0]!.legs![0]).toMatchObject({ from: "YYZ", to: "FRA", departAt: "2026-11-15T16:00:00", arriveAt: "2026-11-16T05:55:00", airline: "Condor", flightNumber: "DE 2403", layoverMinutes: 125 });
    expect(offers[0]!.legs![1]!.layoverMinutes).toBeUndefined();
    expect(offers[1]).toMatchObject({ priceAmount: "1210.50", stops: 0 });
    expect(insights).toEqual({ level: "low", lowest: 970, typicalLow: 980, typicalHigh: 1250 });
  });
  it("asks for a round trip when there is a return day, a one way otherwise, and never puts the key in an error", async () => {
    reply({});
    await searchGoogleFlights(input);
    await searchGoogleFlights({ ...input, returnDate: undefined });
    const urls = guardedFetchMock.mock.calls.map((c) => String(c[1]));
    expect(urls[0]).toContain("type=1");
    expect(urls[0]).toContain("return_date=2026-11-22");
    expect(urls[1]).toContain("type=2");
    expect(urls[1]).not.toContain("return_date");
    reply({ error: "Invalid API key. Your API key should be here: test-key" }, false);
    await expect(searchGoogleFlights(input)).rejects.toThrow(/^SerpAPI request failed: 500$/);
  });
  it("treats 'no results' as an empty answer, not a failure", async () => {
    reply({ error: "Google Flights hasn't returned any results for this query." });
    expect(await searchGoogleFlights(input)).toEqual({ offers: [], insights: null });
  });
});
