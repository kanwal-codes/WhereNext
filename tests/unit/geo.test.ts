import { describe, expect, it } from "vitest";
import { distanceDecay, greatCircleArc, haversineKm, nearest, travelTimeLabel } from "../../lib/application/geo";

describe("geo", () => {
  it("measures straight-line distance", () => {
    // Lisbon centre to Belém Tower is ~6 km
    const km = haversineKm({ latitude: 38.7223, longitude: -9.1393 }, { latitude: 38.6916, longitude: -9.216 });
    expect(km).toBeGreaterThan(5);
    expect(km).toBeLessThan(8);
  });

  it("picks the nearest target and skips ones without coordinates", () => {
    const from = { latitude: 38.71, longitude: -9.14 };
    const result = nearest(from, [
      { title: "Far", latitude: 40, longitude: -8 },
      { title: "Near", latitude: 38.72, longitude: -9.15 },
      { title: "No coords", latitude: NaN, longitude: NaN },
    ]);
    expect(result?.target.title).toBe("Near");
    expect(result?.km).toBeLessThan(3);
  });

  it("returns null when nothing has coordinates", () => {
    expect(nearest({ latitude: 1, longitude: 1 }, [{ title: "x", latitude: NaN, longitude: NaN }])).toBeNull();
  });
});

describe("distanceDecay", () => {
  // Phase 4.2.1 (docs/overhaul/roadmap/phase-4-recommendation-ranking.md) — the actual curve
  // shape, not just "it returns a number": full score inside the offset, the named `decay` value
  // exactly at `scale` km past it, and well below that far beyond.
  it("scores 1.0 anywhere within the offset radius", () => {
    expect(distanceDecay(0, { offset: 2, scale: 2 })).toBe(1);
    expect(distanceDecay(2, { offset: 2, scale: 2 })).toBe(1);
  });

  it("scores exactly the decay value at offset + scale km", () => {
    expect(distanceDecay(2 + 5, { offset: 2, scale: 5 })).toBeCloseTo(0.5, 10);
    expect(distanceDecay(2 + 5, { offset: 2, scale: 5, decay: 0.3 })).toBeCloseTo(0.3, 10);
  });

  it("approaches 0 well beyond scale", () => {
    expect(distanceDecay(2 + 50, { offset: 2, scale: 5 })).toBeLessThan(0.001);
  });
});

describe("greatCircleArc", () => {
  it("returns a multi-point curved path starting and ending at the given coordinates", () => {
    const jfk: [number, number] = [-73.7789, 40.6413];
    const lhr: [number, number] = [-0.4543, 51.47];
    const arc = greatCircleArc(jfk, lhr, 20);
    expect(arc.length).toBeGreaterThan(2);
    expect(arc[0][0]).toBeCloseTo(jfk[0], 1);
    expect(arc[0][1]).toBeCloseTo(jfk[1], 1);
    expect(arc[arc.length - 1][0]).toBeCloseTo(lhr[0], 1);
    expect(arc[arc.length - 1][1]).toBeCloseTo(lhr[1], 1);
  });
});

describe("travelTimeLabel", () => {
  it("walks short distances, takes transit across a city, drives far", () => {
    expect(travelTimeLabel(0.5)).toBe("8 min walk");
    expect(travelTimeLabel(3)).toBe("21 min transit");
    expect(travelTimeLabel(20)).toBe("57 min drive");
  });
});
