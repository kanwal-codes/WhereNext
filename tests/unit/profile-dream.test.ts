import { describe, expect, it } from "vitest";
import { accountPhotoUrl } from "../../lib/places-ui";
import { travelerProfileSchema } from "../../packages/contracts/profile";

describe("profile dream destination", () => {
  it("accepts a destination with its photo", () => {
    const parsed = travelerProfileSchema.parse({ dreamDestination: " Kyoto, Japan ", dreamPhotoName: "places/ChIJabc/photos/AUc123" });
    expect(parsed).toMatchObject({ dreamDestination: "Kyoto, Japan", dreamPhotoName: "places/ChIJabc/photos/AUc123" });
  });
  it("lets both be cleared with null", () => {
    expect(travelerProfileSchema.parse({ dreamDestination: null, dreamPhotoName: null })).toMatchObject({ dreamDestination: null, dreamPhotoName: null });
  });
  it("rejects anything that is not a Google photo resource name", () => {
    expect(travelerProfileSchema.safeParse({ dreamPhotoName: "https://evil.example/x.jpg" }).success).toBe(false);
  });
});

describe("accountPhotoUrl", () => {
  it("builds the same-origin account proxy URL, with an optional width", () => {
    expect(accountPhotoUrl("places/a/photos/b", 1600)).toBe("/api/account/places/photo?name=places%2Fa%2Fphotos%2Fb&w=1600");
    expect(accountPhotoUrl("places/a/photos/b")).toBe("/api/account/places/photo?name=places%2Fa%2Fphotos%2Fb");
  });
  it("returns nothing for a missing or malformed name", () => {
    expect(accountPhotoUrl(null)).toBeUndefined();
    expect(accountPhotoUrl("https://x.test/a.jpg")).toBeUndefined();
  });
});
