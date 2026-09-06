import { describe, expect, it } from "vitest";
import { buildTripRowUpdate, proposedTripUpdateSchema, withExplicitDestination } from "../../lib/application/trip-update";

describe("trip update planning", () => {
  it("supports duration-only updates without inventing dates", () => {
    expect(buildTripRowUpdate({ id: "t", name: "Trip", destination: null }, { durationDays: 5 })).toEqual({ duration_days: 5 });
  });

  it("clears stale duration when dates are cleared", () => {
    expect(buildTripRowUpdate(
      { id: "t", name: "Trip", destination: "Montreal", start_date: "2026-10-26", end_date: "2026-10-30", duration_days: 5 },
      { startDate: null, endDate: null },
    )).toEqual({ start_date: null, end_date: null, duration_days: null });
  });

  it("computes duration for exact date windows", () => {
    expect(buildTripRowUpdate({ id: "t", name: "Trip", destination: null }, { startDate: "2026-10-26", endDate: "2026-10-30" }))
      .toMatchObject({ start_date: "2026-10-26", end_date: "2026-10-30", duration_days: 5 });
  });

  it("rejects impossible calendar dates and reversed windows", () => {
    expect(() => buildTripRowUpdate(null, { startDate: "2026-99-99", endDate: "2026-10-30" })).toThrow(/real calendar/);
    expect(() => buildTripRowUpdate(null, { startDate: "2026-10-30", endDate: "2026-10-26" })).toThrow(/out of order/);
  });

  it("parses duration-only resolver output", () => {
    expect(proposedTripUpdateSchema.parse({ durationDays: 4 })).toEqual({ durationDays: 4 });
  });

  it("persists the resolved destination when an explicit turn omitted its trip update", () => {
    expect(withExplicitDestination(null, "i am going to new york", "New York City, New York, USA"))
      .toEqual({ destination: "New York City, New York, USA" });
    expect(withExplicitDestination(null, "confirm destinatiion", "New York City, New York, USA"))
      .toEqual({ destination: "New York City, New York, USA" });
    expect(withExplicitDestination(null, "what can I do in Boston?", "Boston, Massachusetts, USA"))
      .toBeNull();
  });
});
