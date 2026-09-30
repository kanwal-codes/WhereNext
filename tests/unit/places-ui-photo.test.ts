import { describe, expect, it } from "vitest";
import { PHOTO_WIDTHS, photoProxyUrl } from "../../lib/places-ui";

describe("photoProxyUrl", () => {
  const name = "places/ChIJ123/photos/AbC_d-1";

  it("points at the authenticated proxy for the trip, with no width by default", () => {
    expect(photoProxyUrl("trip-1", name)).toBe(`/api/trips/trip-1/places/google/photo?name=${encodeURIComponent(name)}`);
  });

  it("can ask for a wider photo", () => {
    expect(photoProxyUrl("trip-1", name, 1600)).toBe(`/api/trips/trip-1/places/google/photo?name=${encodeURIComponent(name)}&w=1600`);
  });

  it("refuses anything that is not a Google photo resource name", () => {
    expect(photoProxyUrl("trip-1", undefined)).toBeUndefined();
    expect(photoProxyUrl("trip-1", "https://evil.example/x.jpg")).toBeUndefined();
    expect(photoProxyUrl("trip-1", "places/a/photos/b/../c")).toBeUndefined();
  });

  it("offers the default width first, then the wider ones", () => {
    expect(PHOTO_WIDTHS).toEqual([800, 1200, 1600]);
  });
});
