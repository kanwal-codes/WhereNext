import { describe, expect, it } from "vitest";
import { effectiveTripDays } from "../../features/trip/domain/trip";

describe("effectiveTripDays", () => {
  it("counts the dates when both are set, even when the stored length disagrees", () => {
    expect(effectiveTripDays({ start_date: "2026-12-18", end_date: "2026-12-22", duration_days: 3 })).toBe(5);
  });
  it("falls back to the stored length when the dates are not both set or make no sense", () => {
    expect(effectiveTripDays({ start_date: "2026-12-18", end_date: null, duration_days: 4 })).toBe(4);
    expect(effectiveTripDays({ start_date: "2026-12-22", end_date: "2026-12-18", duration_days: 4 })).toBe(4);
  });
  it("is null with neither", () => {
    expect(effectiveTripDays({ start_date: null, end_date: null, duration_days: null })).toBeNull();
    expect(effectiveTripDays({ duration_days: 0 })).toBeNull();
    expect(effectiveTripDays(null)).toBeNull();
  });
});
