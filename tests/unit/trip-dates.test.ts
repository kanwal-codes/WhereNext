import { describe, expect, it } from "vitest";
import { daysUntilTrip, tripDayIndex, tripWhen } from "../../lib/trip-dates";

const at = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

describe("daysUntilTrip", () => {
  it("counts up to a future start date", () => {
    expect(daysUntilTrip("2026-03-20", at("2026-03-14"))).toBe(6);
  });
  it("is zero on the start date, negative once the trip has started", () => {
    expect(daysUntilTrip("2026-03-14", at("2026-03-14"))).toBe(0);
    expect(daysUntilTrip("2026-03-14", at("2026-03-17"))).toBe(-3);
  });
  it("is null without a start date or with a bad one", () => {
    expect(daysUntilTrip(null)).toBeNull();
    expect(daysUntilTrip("not-a-date", at("2026-03-14"))).toBeNull();
  });
});

describe("tripDayIndex", () => {
  it("is day 1 on the start date", () => {
    expect(tripDayIndex("2026-03-14", at("2026-03-14"))).toBe(1);
  });
  it("counts elapsed days inclusively", () => {
    expect(tripDayIndex("2026-03-14", at("2026-03-17"))).toBe(4);
  });
  it("is null before the trip starts", () => {
    expect(tripDayIndex("2026-03-14", at("2026-03-10"))).toBeNull();
  });
  it("is null without a start date or with a bad one", () => {
    expect(tripDayIndex(null)).toBeNull();
    expect(tripDayIndex("not-a-date", at("2026-03-14"))).toBeNull();
  });
});

describe("tripWhen", () => {
  it("shows a dated range with the day count", () => {
    expect(tripWhen("2026-03-14", "2026-03-20")).toMatch(/\(7 days\)/);
  });
  it("falls back to a bare length, then to empty", () => {
    expect(tripWhen(null, null, 5)).toBe("5 days");
    expect(tripWhen(null, null, null)).toBe("Not set");
  });
});
