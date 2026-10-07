import { describe, expect, it } from "vitest";
import { placeSchema } from "@/packages/contracts/place";

describe("placeSchema", () => {
  it("accepts Google's long photo resource names (about 460 characters today)", () => {
    const photo = `places/ChIJ4Q7ViTsayUwRmoxxpGPEjUw/photos/${"A".repeat(420)}`;
    const place = { provider: "google-places", providerId: "ChIJ4Q7ViTsayUwRmoxxpGPEjUw", name: "Mount Royal Park", category: "park", latitude: 45.5, longitude: -73.6, address: null, sourceUrl: null, photoNames: [photo] };
    expect(placeSchema.safeParse(place).success).toBe(true);
  });
});
