import { describe, expect, it } from "vitest";
import { pickLegOption, type LegOption } from "@/lib/application/leg-options";

const opt = (mode: LegOption["mode"], minutes: number): LegOption => ({
  mode, minutes, km: 1, fare: null, departure: null, arrival: null, steps: [], polyline: [],
});

describe("pickLegOption", () => {
  it("defaults to transit over driving when both are available", () => {
    const { picked, alternatives, note } = pickLegOption([opt("drive", 10), opt("transit", 20)]);
    expect(picked.mode).toBe("transit");
    expect(alternatives).toEqual([{ mode: "drive", minutes: 10, km: 1, fare: null }]);
    expect(note).toBeNull();
  });

  it("falls back to driving with a note when transit isn't available", () => {
    const { picked, note } = pickLegOption([opt("drive", 10)]);
    expect(picked.mode).toBe("drive");
    expect(note).toBe("No transit route found — driving time shown.");
  });

  it("honours a saved rider choice over the default preference order", () => {
    const { picked, note, alternatives } = pickLegOption([opt("drive", 10), opt("transit", 20)], "drive");
    expect(picked.mode).toBe("drive");
    expect(note).toBeNull();
    expect(alternatives).toEqual([{ mode: "transit", minutes: 20, km: 1, fare: null }]);
  });

  it("ignores a saved choice that's no longer available and falls back to default order", () => {
    const { picked } = pickLegOption([opt("transit", 20)], "walk");
    expect(picked.mode).toBe("transit");
  });
});
