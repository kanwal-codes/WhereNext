import { describe, expect, it } from "vitest";
import { photoProxyUrl, snapPhotoWidth } from "../../lib/places-ui";

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

  it("snaps a requested width to 80px steps, between 240 and 1600", () => {
    expect(snapPhotoWidth(undefined)).toBe(800);
    expect(snapPhotoWidth("250")).toBe(240);
    expect(snapPhotoWidth(100)).toBe(240);
    expect(snapPhotoWidth(1200)).toBe(1200);
    expect(snapPhotoWidth(1600)).toBe(1600);
    expect(snapPhotoWidth(99999)).toBe(1600);
    expect(snapPhotoWidth("junk")).toBe(800);
  });
});
