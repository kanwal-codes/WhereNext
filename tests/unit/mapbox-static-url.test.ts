import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodePolyline, routeMapUrl, staticMapUrl } from "../../packages/providers/mapbox/client";

const prev = process.env.MAPBOX_ACCESS_TOKEN;
beforeAll(() => { process.env.MAPBOX_ACCESS_TOKEN = "pk.test"; });
afterAll(() => { process.env.MAPBOX_ACCESS_TOKEN = prev; });

describe("staticMapUrl", () => {
  it("adds padding only with the auto viewport (pins present)", () => {
    const url = staticMapUrl([[-73.5537, 45.5017]], { width: 640, height: 420 });
    expect(url).toContain("/auto/");
    expect(url).toContain("&padding=48");
    expect(url).toContain("pin-s-1+2c7a5a(-73.55370,45.50170)");
  });

  it("omits padding on the empty-markers centre view — Mapbox 422s on padding + lon,lat,zoom", () => {
    const url = staticMapUrl([], { width: 640, height: 420 });
    expect(url).toContain("/0,20,1/");
    expect(url).not.toContain("padding");
  });

  it("clamps the image dimensions to Mapbox's 1280 ceiling", () => {
    expect(staticMapUrl([], { width: 5000, height: 5000 })).toContain("/1280x1280@2x");
  });
});

describe("routeMapUrl", () => {
  it("encodes a line as a precision-5 polyline (the documented Google example)", () => {
    expect(encodePolyline([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]])).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  it("draws lines in order, pins last, and drops the faintest lines when the URL gets too long", () => {
    const line = { points: [[-0.12, 51.5], [0.05, 51.56]] as Array<[number, number]>, color: "#27221e", width: 5 };
    const url = routeMapUrl([{ ...line, color: "#9fb3c6", width: 3, opacity: 0.8 }, line], [{ at: [-0.12, 51.5], color: "#ec6a3a" }], { width: 640, height: 260 });
    expect(url.indexOf("path-3+9fb3c6-0.8")).toBeLessThan(url.indexOf("path-5+27221e-1"));
    expect(url.indexOf("path-5+27221e-1")).toBeLessThan(url.indexOf("pin-s+ec6a3a"));
    expect(url).toContain("/auto/640x260@2x");

    const long = Array.from({ length: 400 }, (_, i) => [-0.12 + i * 0.0007, 51.5 + Math.sin(i) * 0.01] as [number, number]);
    const many = Array.from({ length: 12 }, (_, i) => ({ points: long, color: i === 11 ? "#27221e" : "#9fb3c6", width: i === 11 ? 5 : 3 }));
    const trimmed = routeMapUrl(many, [], { width: 640, height: 260 });
    expect(trimmed.length).toBeLessThanOrEqual(7800);
    expect(trimmed).toContain("path-5+27221e");
  });
});
