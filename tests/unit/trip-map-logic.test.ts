import { describe, expect, it } from "vitest";
import { framingPadding, labelSide, pinSvg, pinsShown } from "../../components/tripMapLogic";
import { basemapPaints } from "../../components/tripMapStyle";
import type { MapPin } from "../../components/TripMap";

describe("framingPadding", () => {
  it("leaves the default margins on a roomy map", () => {
    expect(framingPadding(undefined, 1200, 800, false)).toEqual({ top: 84, right: 150, bottom: 64, left: 48 });
  });
  it("makes room for a side panel and a sheet", () => {
    expect(framingPadding({ left: 436 }, 1200, 800, false)).toEqual({ top: 84, right: 150, bottom: 64, left: 484 });
    expect(framingPadding({ bottom: 300 }, 1200, 800, false)).toEqual({ top: 84, right: 150, bottom: 404, left: 48 });
  });
  it("leaves more under the route beside a panel on the cinematic map", () => {
    expect(framingPadding({ left: 436 }, 1200, 800, true).bottom).toBe(84);
  });
  it("gives the name chip less room as the map gets narrower", () => {
    expect(framingPadding(undefined, 600, 800, false).right).toBe(96);
    expect(framingPadding(undefined, 450, 800, false).right).toBe(44);
  });
  it("shrinks every margin together rather than ask for more room than the map has", () => {
    const p = framingPadding({ left: 300 }, 400, 800, false);
    expect(p.left).toBeLessThan(348);
    expect(p.left / p.top).toBeCloseTo(348 / 84, 5);
  });
});

describe("labelSide", () => {
  it("goes right unless it would run off the map", () => {
    expect(labelSide(100, 120, 1200)).toBe("right");
    expect(labelSide(1000, 120, 1200)).toBe("left");
    expect(labelSide(1000, 20, 1200)).toBe("right");
  });
});

describe("pinsShown", () => {
  const p = (id: string, day?: number) => ({ id, name: id, lng: 0, lat: 0, kind: "see", day }) as MapPin;
  it("keeps the chosen day, or all, in day order (undated first)", () => {
    const pins = [p("c", 2), p("a", 1), p("s"), p("b", 1)];
    expect(pinsShown(pins, "all").map((x) => x.id)).toEqual(["s", "a", "b", "c"]);
    expect(pinsShown(pins, 1).map((x) => x.id)).toEqual(["a", "b"]);
    expect(pinsShown(pins, 9)).toEqual([]);
  });
});

describe("pinSvg", () => {
  it("shows a number, a bed or a dot", () => {
    expect(pinSvg("#f00", 3)).toMatch(/<text[^>]*>3<\/text>/);
    expect(pinSvg("#f00", "bed")).toContain("M2 4v16");
    expect(pinSvg("#f00", null)).toContain('r="4.5"');
    expect(pinSvg("#abc", 1)).toContain('fill="#abc"');
  });
});

describe("basemapPaints", () => {
  const layers = [{ id: "water", type: "fill" }, { id: "road-label", type: "symbol" }, { id: "poi-label", type: "symbol" }, { id: "road", type: "line" }];
  it("warms the light style layer by layer", () => {
    expect(basemapPaints(layers, false)).toEqual([
      ["water", "fill-color", "#ceecf7"],
      ["road-label", "text-color", "#514c46"],
      ["road-label", "text-halo-color", "#fdfcfa"],
      ["poi-label", "text-opacity", 0.7],
    ]);
  });
  it("leaves the dark style alone", () => {
    expect(basemapPaints(layers, true)).toEqual([]);
  });
});
