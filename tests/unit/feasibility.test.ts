import { describe, expect, it } from "vitest";
import { dayCapacity, feasibilityHint } from "../../lib/application/feasibility";

describe("feasibility", () => {
  it("scales the daily stop budget by pace", () => {
    expect(dayCapacity("relaxed")).toBe(3);
    expect(dayCapacity("balanced")).toBe(4);
    expect(dayCapacity("packed")).toBe(6);
    expect(dayCapacity(undefined)).toBe(4);
  });

  it("names days that already exceed the capacity", () => {
    // Persisted itinerary indexes are one-based.
    const hint = feasibilityHint("relaxed", [1, 1, 1, 1, 2, 2]);
    expect(hint).toContain("Day 1");
    expect(hint).not.toContain("Day 2");
    expect(hint).toMatch(/exceed/);
  });

  it("gives a plain nudge when nothing is overloaded", () => {
    const hint = feasibilityHint("balanced", [1, 1, 2]);
    expect(hint).toMatch(/realistic day is about 4 stops/);
    expect(hint).not.toMatch(/exceed/);
  });
});
