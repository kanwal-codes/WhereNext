import { describe, expect, it } from "vitest";
import { hotelPhotoSrc, isGoogleImageUrl } from "@/lib/hotel-photo";

describe("hotelPhotoSrc", () => {
  it("routes Google's image hosts through our own origin, and nothing else", () => {
    const g = "https://lh3.googleusercontent.com/gps-cs-s/abc=w287-h192-n-k-no-v1";
    expect(hotelPhotoSrc(g)).toBe(`/api/hotel-photo?u=${encodeURIComponent(g)}`);
    expect(hotelPhotoSrc("https://encrypted-tbn3.gstatic.com/images?q=tbn:abc")).toContain("/api/hotel-photo?u=");
    expect(hotelPhotoSrc("https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=x")).toContain("/api/hotel-photo?u=");
    expect(hotelPhotoSrc("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    expect(hotelPhotoSrc("/api/trips/x/places/google/photo?name=y")).toBe("/api/trips/x/places/google/photo?name=y");
    expect(hotelPhotoSrc(null)).toBeNull();
    expect(hotelPhotoSrc(undefined)).toBeUndefined();
  });

  it("is not an open proxy: no http, no look-alike hosts, no other Google hosts", () => {
    expect(isGoogleImageUrl("http://lh3.googleusercontent.com/a")).toBe(false);
    expect(isGoogleImageUrl("https://lh3.googleusercontent.com.evil.test/a")).toBe(false);
    expect(isGoogleImageUrl("https://evil.test/?x=lh3.googleusercontent.com")).toBe(false);
    expect(isGoogleImageUrl("https://www.google.com/a")).toBe(false);
    expect(isGoogleImageUrl("not a url")).toBe(false);
  });
});
