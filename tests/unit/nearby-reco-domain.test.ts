import { describe, expect, it } from "vitest";
import { collectionBlockFor, impressionRows, queryFor, rankContextFrom, type ShapedLane } from "../../features/places/domain/nearby-reco";
import type { Lane } from "../../packages/reco/vibes";

const anchor = { name: "Louvre", city: "Paris, France" };
const lane = (over: Partial<Lane> = {}): Lane => ({ id: "l", title: "Lane", source: "places", query: "cafe", ...over });

describe("queryFor", () => {
  it("leans a lane on the anchor by name and city", () => {
    expect(queryFor(lane(), anchor)).toBe("cafe near Louvre Paris, France");
  });
  it("keeps a radius lane city-wide", () => {
    expect(queryFor(lane({ radiusKm: 3 }), anchor)).toBe("cafe in Paris, France");
  });
  it("builds a query from the anchor when the lane asks to", () => {
    expect(queryFor(lane({ query: (a) => `events at ${a.name}` }), anchor)).toBe("events at Louvre near Louvre Paris, France");
  });
  it("folds an event anchor's genre (after its segment) into an events query", () => {
    expect(queryFor(lane({ source: "events", query: "concert" }), { ...anchor, genre: "Music · Rock" })).toBe("concert Rock");
    expect(queryFor(lane({ source: "events", query: "concert" }), { ...anchor, genre: "Music" })).toBe("concert");
    expect(queryFor(lane({ source: "events", query: "" }), { ...anchor, genre: "Music · Rock" })).toBe("");
  });
});

describe("impressionRows", () => {
  const shaped = (placeCount: number, eventCount: number): ShapedLane => ({
    lane: lane({ id: "x" }),
    places: Array.from({ length: placeCount }, (_, i) => ({ place: { providerId: `p${i}` } as never, score: 1, why: null })),
    events: Array.from({ length: eventCount }, (_, i) => ({ url: `u${i}`, title: "t", source: "s" })),
  });
  it("counts the four cards on screen, places first then events", () => {
    const rows = impressionRows([shaped(2, 5)]);
    expect(rows.map((r) => [r.itemKind, r.itemId, r.position])).toEqual([["place", "p0", 0], ["place", "p1", 1], ["event", "u0", 0], ["event", "u1", 1]]);
    expect(rows.every((r) => r.action === "impression" && r.laneId === "x")).toBe(true);
  });
  it("does not count cards past four", () => {
    expect(impressionRows([shaped(9, 9)])).toHaveLength(4);
    expect(impressionRows([shaped(0, 0)])).toEqual([]);
  });
});

describe("rankContextFrom", () => {
  it("reads interests, likes, dislikes, saved ids and the stay", () => {
    const ctx = rankContextFrom({
      prefs: { interests: ["art", 3], likes: ["jazz"], dislikes: ["crowds"] },
      savedPlaces: [{ places: { provider_id: "a" } }, { provider_id: "b" }, {}],
      rejectedPlaceIds: ["r"], stayLat: 1, stayLng: 2,
    });
    expect(ctx).toEqual({ interests: ["art"], likes: ["jazz"], dislikes: ["crowds"], savedIds: ["a", "b"], rejectedIds: ["r"], stayAnchor: { latitude: 1, longitude: 2 } });
  });
  it("copes with nothing", () => {
    expect(rankContextFrom({ prefs: undefined, savedPlaces: undefined, rejectedPlaceIds: undefined, stayLat: null, stayLng: 2 })).toEqual({ interests: [], likes: [], dislikes: [], savedIds: [], rejectedIds: [], stayAnchor: null });
  });
});

describe("collectionBlockFor", () => {
  const places = [{ place: { providerId: "p", name: "P", photoNames: ["places/p/photos/1"] } as never, score: 1, why: null }];
  it("is an events block when the lane has events", () => {
    expect(collectionBlockFor("t", lane(), places, [{ url: "u", title: "T", source: "s" }])).toMatchObject({ type: "events", items: [{ url: "u" }] });
  });
  it("is a place list, with each photo resolved, otherwise", () => {
    const block = collectionBlockFor("t", lane({ title: "Cafés" }), places, []) as { type: string; title: string; places: Array<{ photoUrl?: string }> };
    expect(block).toMatchObject({ type: "place_list", title: "Cafés" });
    expect(block.places[0].photoUrl).toBe("/api/trips/t/places/google/photo?name=places%2Fp%2Fphotos%2F1&w=480");
  });
});
