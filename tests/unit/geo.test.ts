import { describe, expect, it } from "vitest";
import { haversineKm, nearest } from "../../lib/application/geo";

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
