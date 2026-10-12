import { describe, expect, it } from "vitest";
import { routePlaceCalls } from "../../lib/application/route-calls";

const stops = ["New York", "Rome", "Paris"].map((city) => ({ city, startDate: null, endDate: null }));
const base = { wantsItinerary: true, requestedDays: null, tripDays: 20, stops, locationFocus: "New York, Rome, Paris", existing: [] as Array<{ tool: string; location?: string | null }> };

describe("routePlaceCalls", () => {
  it("searches every city for a whole-trip plan", () => {
    expect(routePlaceCalls(base).map((c) => c.location)).toEqual(["New York", "Rome", "Paris"]);
  });
  it("skips cities the plan already searches", () => {
    expect(routePlaceCalls({ ...base, existing: [{ tool: "search_places", location: "Rome, Italy" }] }).map((c) => c.location)).toEqual(["New York", "Paris"]);
  });
  it("adds nothing for one city's days, a one-city trip, or a non-plan turn", () => {
    expect(routePlaceCalls({ ...base, locationFocus: "Rome", requestedDays: 3 })).toEqual([]);
    expect(routePlaceCalls({ ...base, requestedDays: 3 })).toEqual([]);
    expect(routePlaceCalls({ ...base, stops: stops.slice(0, 1) })).toEqual([]);
    expect(routePlaceCalls({ ...base, wantsItinerary: false })).toEqual([]);
  });
  it("treats a plan for most of the trip as the whole trip, and caps the extra searches", () => {
    expect(routePlaceCalls({ ...base, requestedDays: 18 })).toHaveLength(3);
    const many = Array.from({ length: 9 }, (_, i) => ({ city: `City${i}`, startDate: null, endDate: null }));
    expect(routePlaceCalls({ ...base, stops: many, locationFocus: null })).toHaveLength(5);
  });
});
