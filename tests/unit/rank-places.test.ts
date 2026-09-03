import { describe, expect, it } from "vitest";
import { rankPlaces } from "../../lib/application/rank-places";
import type { Place } from "../../packages/contracts/place";

const p = (over: Partial<Place>): Place => ({
  provider: "google-places", providerId: over.name ?? "x", name: "X", category: "point_of_interest",
  latitude: 45.5, longitude: -73.57, address: "", rating: 4.0, userRatingCount: 100,
  priceLevel: undefined, sourceUrl: "", photoNames: [], ...over,
});

describe("rankPlaces", () => {
  it("drops a place that matches a stated dislike", () => {
    const out = rankPlaces([p({ name: "Museum of Art" }), p({ name: "Night Club Deluxe" })], { dislikes: ["clubs"] });
    expect(out.map((r) => r.place.name)).toEqual(["Museum of Art"]);
  });

  it("ranks an interest match above a higher-rated non-match", () => {
    const generic = p({ name: "Generic Plaza", rating: 4.9, userRatingCount: 5000 });
    const match = p({ name: "Ramen Bar", category: "restaurant", rating: 4.2, userRatingCount: 300 });
    const out = rankPlaces([generic, match], { interests: ["ramen", "food"] });
    expect(out[0].place.name).toBe("Ramen Bar");
    expect(out[0].why).toMatch(/matches/i);
  });

  it("prefers a place near the anchor and labels why", () => {
    const near = p({ name: "Close Cafe", latitude: 45.5, longitude: -73.57 });
    const far = p({ name: "Far Cafe", latitude: 46.8, longitude: -71.2, rating: 4.6, userRatingCount: 800 });
    const out = rankPlaces([far, near], { anchor: { latitude: 45.5, longitude: -73.57 } });
    expect(out[0].place.name).toBe("Close Cafe");
    expect(out[0].why).toMatch(/near where you're staying/i);
  });

  it("penalises already-saved places", () => {
    const a = p({ name: "A", providerId: "a" });
    const b = p({ name: "B", providerId: "b" });
    const out = rankPlaces([a, b], { savedIds: ["a"] });
    expect(out[0].place.providerId).toBe("b");
  });
});
