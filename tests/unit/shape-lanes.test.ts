import { describe, expect, it } from "vitest";
import type { Place } from "@/packages/contracts/place";
import type { Lane } from "@/packages/reco/vibes";
import { shapeLanes } from "@/packages/reco/shape-lanes";

const place = (id: string, over: Partial<Place> = {}): Place => ({
  provider: "google-places",
  providerId: id,
  name: id,
  category: "restaurant",
  latitude: 0,
  longitude: 0,
  address: null,
  rating: 4,
  userRatingCount: 100,
  sourceUrl: null,
  ...over,
});

const lane = (over: Partial<Lane> = {}): Lane => ({ id: "l", title: "L", source: "places", query: "q", ...over });
const ctx = (over: Partial<Parameters<typeof shapeLanes>[1]> = {}) => ({
  seenPlaceIds: new Set<string>(),
  seenEventUrls: new Set<string>(),
  anchorPoint: null,
  rankCtx: {},
  ...over,
});

describe("shapeLanes", () => {
  it("dedupes across lanes — first lane wins", async () => {
    const out = await shapeLanes(
      [
        { lane: lane({ id: "a" }), places: [place("p1"), place("p2")], events: [] },
        { lane: lane({ id: "b" }), places: [place("p2"), place("p3")], events: [] },
      ],
      ctx(),
    );
    expect(out.find((l) => l.lane.id === "a")!.places.map((p) => p.place.providerId)).toContain("p2");
    expect(out.find((l) => l.lane.id === "b")!.places.map((p) => p.place.providerId)).toEqual(["p3"]);
  });

  it("drops seeded (anchor / rejected) place ids", async () => {
    const out = await shapeLanes(
      [{ lane: lane(), places: [place("keep"), place("nope")], events: [] }],
      ctx({ seenPlaceIds: new Set(["nope"]) }),
    );
    expect(out[0].places.map((p) => p.place.providerId)).toEqual(["keep"]);
  });

  it("radius-filters when the lane asks and an anchor point exists", async () => {
    const near = place("near", { latitude: 0.001, longitude: 0.001 });
    const far = place("far", { latitude: 5, longitude: 5 });
    const out = await shapeLanes(
      [{ lane: lane({ radiusKm: 1 }), places: [near, far], events: [] }],
      ctx({ anchorPoint: { latitude: 0, longitude: 0 } }),
    );
    expect(out[0].places.map((p) => p.place.providerId)).toEqual(["near"]);
  });

  it("caps a peek lane at one item", async () => {
    const out = await shapeLanes(
      [{ lane: lane({ layout: "peek" }), places: [place("a"), place("b"), place("c")], events: [] }],
      ctx(),
    );
    expect(out[0].places).toHaveLength(1);
  });

  it("blends the semantic score so a strong match climbs", async () => {
    const out = await shapeLanes(
      [{ lane: lane({ semantic: true }), places: [place("dull"), place("match")], events: [] }],
      ctx({ score: async () => ({ match: 0.9, dull: 0.0 }) }),
    );
    expect(out[0].places[0].place.providerId).toBe("match");
  });

  it("does not call the scorer for a non-semantic lane", async () => {
    let called = false;
    await shapeLanes(
      [{ lane: lane(), places: [place("a"), place("b")], events: [] }],
      ctx({
        score: async () => {
          called = true;
          return {};
        },
      }),
    );
    expect(called).toBe(false);
  });

  it("keeps only one branch per chain, the best-ranked one, so a lane doesn't fill with one brand", async () => {
    const out = await shapeLanes(
      [
        {
          lane: lane(),
          places: [
            place("fb1", { name: "Food Bazaar", rating: 4.4 }),
            place("market", { name: "Dekalb Market Hall", rating: 4.6 }),
            place("fb2", { name: "FOOD BAZAAR", rating: 4.7 }), // same chain, different branch, better rated
            place("fb3", { name: "food bazaar", rating: 4.3 }), // same chain again, case-different
          ],
          events: [],
        },
      ],
      ctx(),
    );
    const names = out[0].places.map((p) => p.place.name);
    expect(names).toEqual(["FOOD BAZAAR", "Dekalb Market Hall"]); // one Food Bazaar branch, the best-rated one
  });

  it("dedupes events by url and drops empty lanes", async () => {
    const out = await shapeLanes(
      [
        { lane: lane({ id: "e1", source: "events" }), places: [], events: [{ url: "u1" }, { url: "u2" }] },
        { lane: lane({ id: "e2", source: "events" }), places: [], events: [{ url: "u2" }] },
      ],
      ctx(),
    );
    expect(out.map((l) => l.lane.id)).toEqual(["e1"]); // e2 emptied by dedupe → filtered out
    expect(out[0].events.map((e) => e.url)).toEqual(["u1", "u2"]);
  });
});
