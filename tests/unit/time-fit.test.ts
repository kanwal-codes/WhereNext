import { describe, expect, it } from "vitest";
import { computeTimeFit, isTimeFitAtRisk } from "@/lib/application/time-fit";

describe("computeTimeFit", () => {
  it("returns null when either stop has no time", () => {
    expect(computeTimeFit(undefined, "10:00", 20)).toBeNull();
    expect(computeTimeFit("09:00", undefined, 20)).toBeNull();
  });

  it("returns null when travel minutes are unknown", () => {
    expect(computeTimeFit("09:00", "10:00", null)).toBeNull();
  });

  it("computes the gap between two clock times", () => {
    expect(computeTimeFit("09:00", "09:45", 20)).toEqual({ availableMinutes: 45, neededMinutes: 20 });
  });

  it("goes negative when times are entered out of order", () => {
    expect(computeTimeFit("10:00", "09:30", 20)).toEqual({ availableMinutes: -30, neededMinutes: 20 });
  });
});

describe("isTimeFitAtRisk", () => {
  it("flags a leg where travel doesn't fit the gap", () => {
    expect(isTimeFitAtRisk({ availableMinutes: 10, neededMinutes: 20 })).toBe(true);
  });

  it("clears a leg with room to spare", () => {
    expect(isTimeFitAtRisk({ availableMinutes: 30, neededMinutes: 20 })).toBe(false);
  });

  it("is never at risk when there's nothing to check", () => {
    expect(isTimeFitAtRisk(null)).toBe(false);
  });
});
