import { describe, expect, it } from "vitest";
import { prominenceScore, rankPlaces } from "../../lib/application/rank-places";
import type { Place } from "../../packages/contracts/place";

const p = (over: Partial<Place>): Place => ({
  provider: "google-places", providerId: over.name ?? "x", name: "X", category: "point_of_interest",
  latitude: 45.5, longitude: -73.57, address: "", rating: 4.0, userRatingCount: 100,
  priceLevel: undefined, sourceUrl: "", photoNames: [], ...over,
});

describe("prominenceScore", () => {
  // Phase 4.1.1 (docs/overhaul/roadmap/phase-4-recommendation-ranking.md) gate: a high rating
  // with very few reviews should generally lose to a slightly lower rating with many.
  it("scores a 4.8★/3-review place lower than a 4.5★/400-review place", () => {
    expect(prominenceScore(4.8, 3)).toBeLessThan(prominenceScore(4.5, 400));
  });

  it("a higher rating at the same review count scores higher", () => {
    expect(prominenceScore(4.9, 100)).toBeGreaterThan(prominenceScore(3.5, 100));
  });

  it("more reviews at the same rating scores higher", () => {
    expect(prominenceScore(4.5, 1000)).toBeGreaterThan(prominenceScore(4.5, 10));
  });

  it("zero reviews doesn't crash or go negative/NaN", () => {
    const score = prominenceScore(4.5, 0);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("a missing rating or review count falls back to a sane default instead of crashing", () => {
    expect(Number.isFinite(prominenceScore(undefined, undefined))).toBe(true);
    expect(Number.isFinite(prominenceScore(4.2, undefined))).toBe(true);
    expect(Number.isFinite(prominenceScore(undefined, 200))).toBe(true);
  });
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
    expect(out[0].why).toBe("Ramen");
  });

  it("prefers a place near the anchor, but does NOT label it as the stay unless a real stayAnchor is given", () => {
    const near = p({ name: "Close Cafe", latitude: 45.5, longitude: -73.57 });
    const far = p({ name: "Far Cafe", latitude: 46.8, longitude: -71.2, rating: 4.6, userRatingCount: 800 });
    const out = rankPlaces([far, near], { anchor: { latitude: 45.5, longitude: -73.57 } });
    expect(out[0].place.name).toBe("Close Cafe");
    // `anchor` alone may be an averaged itinerary centroid with nothing real to name — only
    // `stayAnchor` (a genuinely locked hotel) earns the "from your stay" label.
    expect(String(out[0].why)).not.toMatch(/your stay/i);
  });

  it("labels distance-to-stay honestly, and only within NEARBY_STAY_KM", () => {
    const close = p({ name: "Close Cafe", latitude: 45.5, longitude: -73.57 });
    const stayAnchor = { latitude: 45.501, longitude: -73.571 }; // ~150 m away
    const [result] = rankPlaces([close], { stayAnchor });
    expect(result.why).toMatch(/m from your stay/i);

    const farAway = p({ name: "Far Cafe", latitude: 46.8, longitude: -71.2, rating: 3.9, userRatingCount: 50 });
    const [farResult] = rankPlaces([farAway], { stayAnchor });
    expect(String(farResult.why)).not.toMatch(/from your stay/i);
  });

  it("penalises already-saved places", () => {
    const a = p({ name: "A", providerId: "a" });
    const b = p({ name: "B", providerId: "b" });
    const out = rankPlaces([a, b], { savedIds: ["a"] });
    expect(out[0].place.providerId).toBe("b");
  });

  it("drops a rejected place outright rather than merely deprioritising it", () => {
    const a = p({ name: "A", providerId: "a" });
    const b = p({ name: "B", providerId: "b" });
    const out = rankPlaces([a, b], { rejectedIds: ["a"] });
    expect(out.map((r) => r.place.providerId)).toEqual(["b"]);
  });
});

describe("rankPlaces with the provider's order", () => {
  const bar = p({ name: "Patrick's Rooftop", category: "bar", rating: 3.9, userRatingCount: 143 });
  const casino = p({ name: "Fallsview Casino Resort", category: "casino", rating: 4.3, userRatingCount: 25100 });

  it("ranks a famous place above a small one by default", () => {
    expect(rankPlaces([bar, casino]).map((r) => r.place.name)).toEqual(["Fallsview Casino Resort", "Patrick's Rooftop"]);
  });

  it("keeps the order the provider gave when asked, for a search the reader typed", () => {
    expect(rankPlaces([bar, casino], { providerOrder: true }).map((r) => r.place.name)).toEqual(["Patrick's Rooftop", "Fallsview Casino Resort"]);
  });

  it("still drops a rejected or disliked place in that mode", () => {
    const out = rankPlaces([bar, casino], { providerOrder: true, rejectedIds: [casino.providerId] });
    expect(out.map((r) => r.place.name)).toEqual(["Patrick's Rooftop"]);
  });
});
