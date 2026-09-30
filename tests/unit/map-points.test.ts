import { describe, expect, it } from "vitest";
import { pointsFromItinerary, pointsFromPlaces, pointsFromRoute, pointsFromStays } from "@/features/conversation/ui/blocks/mapPoints";

const place = (over: Record<string, unknown>) => ({ provider: "google", providerId: "p", name: "P", category: "restaurant", latitude: 45.5, longitude: -73.6, address: "", sourceUrl: null, trust: "sourced", ...over }) as never;

describe("map points", () => {
  it("keeps only located places and gives each a kind", () => {
    const out = pointsFromPlaces([place({ providerId: "a" }), place({ providerId: "b", latitude: 0, longitude: 0 }), place({ providerId: "c", category: "museum" })]);
    expect(out.map((p) => [p.id, p.kind])).toEqual([["a", "eat"], ["c", "see"]]);
  });
  it("takes only stops that are real places, optionally for one day", () => {
    const block = { type: "itinerary", days: [
      { label: "Day 1", stops: [{ title: "Park", placeId: "x", kind: "sight" }, { title: "Nap", kind: "rest" }] },
      { label: "Day 2", stops: [{ title: "Lunch", placeId: "y", kind: "food" }] },
    ] } as never;
    expect(pointsFromItinerary(block).map((p) => [p.name, p.day, p.kind])).toEqual([["Park", 1, "see"], ["Lunch", 2, "eat"]]);
    expect(pointsFromItinerary(block, 1).map((p) => p.name)).toEqual(["Lunch"]);
  });
  it("skips hotels without a location", () => {
    expect(pointsFromStays([{ hotelId: "h1", name: "A", latitude: 1, longitude: 2 }, { hotelId: "h2", name: "B" }] as never)).toHaveLength(1);
  });
  it("returns the two ends of a route only when it has a path", () => {
    const route = { type: "route_summary", from: "Hotel, Montreal", to: "Market, Montreal", path: [[-73.5, 45.5], [-73.6, 45.6]] } as never;
    expect(pointsFromRoute(route)).toMatchObject([{ name: "Hotel", lng: -73.5, lat: 45.5 }, { name: "Market", lng: -73.6, lat: 45.6 }]);
    expect(pointsFromRoute({ ...(route as object), path: undefined } as never)).toEqual([]);
  });
});
