import { describe, expect, it } from "vitest";
import { asksForOverview, buildTripSummary } from "@/lib/application/trip-summary";
import type { TripContext } from "@/lib/application/trip-context";

const ctx = (over: Partial<TripContext> = {}): TripContext => ({
  trip: { name: "Montreal trip", destination: "Montreal, Canada", origin: "Toronto", duration_days: 15, start_date: "2026-11-26", end_date: "2026-12-10", travelers: 3 },
  preferences: { budget: 80, currency: "CAD", pace: "Balanced", dietaryNeeds: ["vegetarian"] },
  itinerary: [{ title: "Park", day_index: 1, locked: false }, { title: "Lunch", day_index: 1, locked: false }, { title: "Museum", day_index: 2, locked: false }],
  lockedTitles: [], lockedPlaces: [], lockedStay: null, accommodationAnchor: null, places: [{ status: "saved", place: { name: "A", category: null, address: null } }], decisions: [],
  ...over,
});

describe("buildTripSummary", () => {
  it("collects the saved facts", () => {
    const s = buildTripSummary(ctx())!;
    expect(s.title).toBe("Your trip to Montreal, Canada");
    expect(s.facts).toEqual([{ label: "Dates", value: "2026-11-26 to 2026-12-10", note: "15 days" }, { label: "Travellers", value: "3" }, { label: "Budget", value: "80 CAD", note: "per person a day" }]);
    expect(s.rows).toContainEqual({ label: "Plan", value: "3 stops over 2 days" });
    expect(s.rows).toContainEqual({ label: "Staying at", value: "Not chosen yet" });
    expect(s.rows).toContainEqual({ label: "Dietary", value: "vegetarian" });
  });
  it("says what is missing instead of inventing it", () => {
    const s = buildTripSummary(ctx({ preferences: {}, itinerary: [], places: [], trip: { name: "T", destination: "Rome", origin: null, duration_days: null, start_date: null, end_date: null, travelers: null } }))!;
    expect(s.facts.map((f) => f.value)).toEqual(["Not set", "Not set", "Not set"]);
    expect(s.rows).toContainEqual({ label: "Plan", value: "Nothing planned yet" });
  });
  it("drops a default Solo group beside several travellers", () => {
    const rows = buildTripSummary(ctx({ preferences: { groupType: "Solo" } }))!.rows;
    expect(rows.find((r) => r.label === "Group")).toBeUndefined();
    expect(buildTripSummary(ctx({ preferences: { groupType: "Friends" } }))!.rows).toContainEqual({ label: "Group", value: "Friends" });
  });
  it("names the booked kinds in proper plurals", () => {
    const r = (kind: string) => ({ kind, title: kind, startsOn: null, endsOn: null, startTime: null, endTime: null, place: null, toPlace: null, amount: null, currency: null, amountBasis: "total" as const, cancelled: false });
    const booked = buildTripSummary(ctx({ reservations: [r("activity"), r("activity"), r("dining"), r("flight"), r("stay"), r("stay")] }))!.rows.find((x) => x.label === "Booked")!;
    expect(booked.value).toBe("6 bookings (2 activities, 1 table, 1 flight, 2 stays)");
  });
  it("returns nothing for an empty trip", () => {
    expect(buildTripSummary(ctx({ trip: null }))).toBeNull();
  });
});

describe("asksForOverview", () => {
  it("matches the whole-picture asks only", () => {
    for (const m of ["what do we have so far?", "give me a summary of the trip", "recap please", "what's planned", "where are we at"]) expect(asksForOverview(m)).toBe(true);
    for (const m of ["remind me our dates", "is our budget per day?", "did you save the allergy"]) expect(asksForOverview(m)).toBe(false);
  });
});
