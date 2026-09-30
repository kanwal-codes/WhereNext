import { describe, expect, it } from "vitest";
import { applyFlightView, arrivalDayOffset, availableFilters, DEFAULT_FLIGHT_VIEW } from "../../features/conversation/ui/blocks/FlightFilters";

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
    expect(availableFilters(items)).toEqual({ airports: ["YHU", "YUL"], nonstop: true, changes: true });
    expect(availableFilters([items[0], items[2]])).toMatchObject({ nonstop: false });
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
