import { describe, expect, it } from "vitest";
import { airportNames, applyFlightView, arrivalDayOffset, availableFilters, carriersOf, DEFAULT_FLIGHT_VIEW, facetCounts } from "../../features/conversation/ui/blocks/FlightFilters";

const f = (o: Record<string, unknown>) => ({ airline: "A", price: "100", currency: "CAD", durationMinutes: 80, stops: 0, departAt: "2026-11-26T10:00:00", arriveAt: "2026-11-26T11:20:00", destinationAirport: "YUL", ...o }) as never;
const items = [
  f({ airline: "Cheap", price: "48", destinationAirport: "YHU", departAt: "2026-11-26T19:00:00", fareConditions: ["Changes not allowed"] }),
  f({ airline: "Mid", price: "120", durationMinutes: 465, stops: 1, departAt: "2026-11-26T21:00:00", fareConditions: ["Changes allowed"] }),
  f({ airline: "Fast", price: "283", durationMinutes: 75, departAt: "2026-11-26T08:00:00" }),
];
const names = (v: object) => applyFlightView(items, { ...DEFAULT_FLIGHT_VIEW, ...v }).map((o) => o.airline);

describe("flight sort and filters", () => {
  it("sorts by price, duration and departure", () => {
    expect(names({ sort: "price" })).toEqual(["Cheap", "Mid", "Fast"]);
    expect(names({ sort: "duration" })).toEqual(["Fast", "Cheap", "Mid"]);
    expect(names({ sort: "departure" })).toEqual(["Fast", "Cheap", "Mid"]);
  });
  it("filters by stops, changeable fares and arrival airport", () => {
    expect(names({ nonstop: true })).toEqual(["Cheap", "Fast"]);
    expect(names({ changes: true })).toEqual(["Mid"]);
    expect(names({ airport: "YHU" })).toEqual(["Cheap"]);
  });
  it("offers only filters that would change the list", () => {
    expect(availableFilters(items)).toMatchObject({ airports: ["YHU", "YUL"], nonstop: true, changes: true });
    expect(availableFilters([items[0], items[2]])).toMatchObject({ nonstop: false });
  });
});

describe("more sorts and filters", () => {
  const more = [
    f({ airline: "Dawn", price: "300", stops: 2, durationMinutes: 900, departAt: "2026-11-26T06:30:00" }),
    f({ airline: "Noon", price: "200", stops: 1, durationMinutes: 600, departAt: "2026-11-26T13:00:00" }),
    f({ airline: "Late", price: "250", stops: 0, durationMinutes: 480, departAt: "2026-11-26T22:15:00", legs: [{ layoverMinutes: 420, overnight: false }, { layoverMinutes: 0 }] }),
  ];
  const run = (v: object) => applyFlightView(more, { ...DEFAULT_FLIGHT_VIEW, ...v }).map((o) => o.airline);
  it("sorts high to low, by fewest stops and by latest departure", () => {
    expect(run({ sort: "price_desc" })).toEqual(["Dawn", "Late", "Noon"]);
    expect(run({ sort: "stops" })).toEqual(["Late", "Noon", "Dawn"]);
    expect(run({ sort: "departure_desc" })).toEqual(["Late", "Noon", "Dawn"]);
  });
  it("filters by up to one stop, time of day, airline, price and long layovers", () => {
    expect(run({ stops1: true })).toEqual(["Noon", "Late"]);
    expect(run({ times: ["morning"] })).toEqual(["Dawn"]);
    expect(run({ times: ["afternoon", "evening"] })).toEqual(["Noon", "Late"]);
    expect(run({ airlines: ["Late", "Dawn"] })).toEqual(["Late", "Dawn"]);
    expect(run({ maxPrice: 250 })).toEqual(["Noon", "Late"]);
    expect(run({ layovers: true })).toEqual(["Noon", "Dawn"]);
  });
  it("offers the new filters only when they would change the list", () => {
    expect(availableFilters(more)).toMatchObject({ stops1: true, times: ["morning", "afternoon", "evening"], airlines: ["Dawn", "Noon", "Late"], layovers: true, price: { min: 200, max: 300 } });
    expect(availableFilters([more[1]])).toMatchObject({ stops1: false, times: [], airlines: [], layovers: false, price: null });
  });
});

describe("airlines and counts", () => {
  const co = [
    f({ airline: "Air Canada · United", price: "300", stops: 1 }),
    f({ airline: "Air Canada", price: "200", stops: 0 }),
    f({ airline: "United", price: "250", stops: 1 }),
  ];
  const run = (v: object) => applyFlightView(co, { ...DEFAULT_FLIGHT_VIEW, ...v }).map((o) => o.price);
  it("splits a shared fare into its carriers, so choosing one keeps the shared fares", () => {
    expect(carriersOf(co[0])).toEqual(["Air Canada", "United"]);
    expect(carriersOf(f({ airline: "Air Canada + 2 more" }))).toEqual(["Air Canada"]);
    expect(availableFilters(co).airlines).toEqual(["Air Canada", "United"]);
    expect(run({ airlines: ["Air Canada"] })).toEqual(["200", "300"]);
    expect(run({ airlines: ["United"] })).toEqual(["250", "300"]);
  });
  it("counts each option with its own group's choice cleared", () => {
    const c = facetCounts(co, { ...DEFAULT_FLIGHT_VIEW, nonstop: true });
    expect(c.stops).toEqual({ any: 3, nonstop: 1, stops1: 3 });
    expect(c.airline("United")).toBe(0);
    expect(facetCounts(co, DEFAULT_FLIGHT_VIEW).airline("United")).toBe(2);
  });
});

describe("airportNames", () => {
  it("names a code from the legs, without the word airport", () => {
    const o = f({ legs: [{ from: "YYZ", fromName: "Toronto Pearson International Airport", to: "NRT", toName: "Narita International Airport" }, { from: "NRT", to: "HND", toName: "Haneda Airport" }] });
    expect(airportNames([o])).toEqual({ NRT: "Narita", YYZ: "Toronto Pearson", HND: "Haneda" });
    expect(airportNames([f({})])).toEqual({});
  });
});

describe("arrivalDayOffset", () => {
  it("counts calendar days, including across a month end", () => {
    expect(arrivalDayOffset("2026-11-26T10:00:00", "2026-11-26T11:20:00")).toBe(0);
    expect(arrivalDayOffset("2026-11-26T21:30:00", "2026-11-27T06:55:00")).toBe(1);
    expect(arrivalDayOffset("2026-11-30T22:00:00", "2026-12-02T06:00:00")).toBe(2);
  });
  it("never goes negative or NaN", () => {
    expect(arrivalDayOffset("2026-11-27T10:00:00", "2026-11-26T23:00:00")).toBe(0);
    expect(arrivalDayOffset("soon", "later")).toBe(0);
  });
});
