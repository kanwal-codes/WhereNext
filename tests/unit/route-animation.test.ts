import { describe, expect, it } from "vitest";
import { easeOutQuad, legLines, routeKeyFor } from "@/lib/application/route-animation";

describe("legLines", () => {
  it("computes cumulative start/end km per leg, in order", () => {
    const walk: Array<[number, number]> = [[0, 0], [0, 0.01]]; // ~1.1km north
    const drive: Array<[number, number]> = [[0, 0.01], [0, 0.05]]; // ~4.4km further north
    const { legs, totalKm } = legLines([{ polyline: walk, mode: "walk" }, { polyline: drive, mode: "drive" }]);
    expect(legs).toHaveLength(2);
    expect(legs[0].mode).toBe("walk");
    expect(legs[0].startKm).toBeCloseTo(0);
    expect(legs[1].mode).toBe("drive");
    expect(legs[1].startKm).toBeCloseTo(legs[0].endKm);
    expect(totalKm).toBeCloseTo(legs[1].endKm);
  });

  it("skips a leg with fewer than 2 points instead of throwing", () => {
    const { legs } = legLines([{ polyline: [[0, 0]], mode: "walk" }, { polyline: [[0, 0], [0, 0.01]], mode: "walk" }]);
    expect(legs).toHaveLength(1);
  });

  it("returns a tiny non-zero totalKm for an empty leg list, never zero (a zero total breaks modulo wrap)", () => {
    const { legs, totalKm } = legLines([]);
    expect(legs).toHaveLength(0);
    expect(totalKm).toBeGreaterThan(0);
  });
});

describe("routeKeyFor", () => {
  it("is stable for the same route and changes when the route actually changes", () => {
    const a = [{ polyline: [[0, 0], [1, 1]] as [number, number][], mode: "drive" }];
    const b = [{ polyline: [[0, 0], [1, 1]] as [number, number][], mode: "drive" }];
    const c = [{ polyline: [[0, 0], [2, 2]] as [number, number][], mode: "drive" }];
    expect(routeKeyFor(a)).toBe(routeKeyFor(b));
    expect(routeKeyFor(a)).not.toBe(routeKeyFor(c));
  });

  it("does not change when only a `dim` flag differs, so hover-to-dim doesn't restart the draw-in", () => {
    const base: [number, number][] = [[0, 0], [1, 1]];
    const notDimmed = [{ polyline: base, mode: "drive", dim: false }];
    const dimmed = [{ polyline: base, mode: "drive", dim: true }];
    expect(routeKeyFor(notDimmed)).toBe(routeKeyFor(dimmed));
  });
});

describe("easeOutQuad", () => {
  it("starts at 0, ends at 1, and is monotonically increasing", () => {
    expect(easeOutQuad(0)).toBe(0);
    expect(easeOutQuad(1)).toBe(1);
    expect(easeOutQuad(0.5)).toBeGreaterThan(0);
    expect(easeOutQuad(0.5)).toBeLessThan(1);
    expect(easeOutQuad(0.75)).toBeGreaterThan(easeOutQuad(0.25));
  });
});
