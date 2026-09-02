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
    // pace relaxed (capacity 3); day_index 0 has 4 items, day_index 1 has 2
    const hint = feasibilityHint("relaxed", [0, 0, 0, 0, 1, 1]);
    expect(hint).toContain("Day 1");
    expect(hint).toMatch(/exceed/);
  });

  it("gives a plain nudge when nothing is overloaded", () => {
    const hint = feasibilityHint("balanced", [0, 0, 1]);
    expect(hint).toMatch(/realistic day is about 4 stops/);
    expect(hint).not.toMatch(/exceed/);
  });
});
