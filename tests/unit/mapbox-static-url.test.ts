import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { staticMapUrl } from "../../packages/providers/mapbox/client";

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
