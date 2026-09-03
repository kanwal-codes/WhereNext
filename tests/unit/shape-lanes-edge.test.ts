import { describe, expect, it, vi } from "vitest";
import type { Place } from "@/packages/contracts/place";
import type { Lane } from "@/packages/reco/vibes";
import { shapeLanes } from "@/packages/reco/shape-lanes";

const place = (id: string, over: Partial<Place> = {}): Place => ({
  provider: "google-places", providerId: id, name: id, category: "restaurant",
  latitude: 0, longitude: 0, address: null, rating: 4, userRatingCount: 100, sourceUrl: null, ...over,
});
const lane = (over: Partial<Lane> = {}): Lane => ({ id: "l", title: "L", source: "places", query: "q", ...over });
const ctx = (over: Partial<Parameters<typeof shapeLanes>[1]> = {}) => ({
  seenPlaceIds: new Set<string>(), seenEventUrls: new Set<string>(), anchorPoint: null, rankCtx: {}, ...over,
});

describe("shapeLanes — edge cases", () => {
  it("empty input → empty output", async () => {
    expect(await shapeLanes([], ctx())).toEqual([]);
  });

  it("all lanes empty → empty output (no zero-item sections)", async () => {
    const out = await shapeLanes([
      { lane: lane({ id: "a" }), places: [], events: [] },
      { lane: lane({ id: "b", source: "events" }), places: [], events: [] },
    ], ctx());
    expect(out).toEqual([]);
  });

  it("radiusKm with a null anchorPoint does NOT filter (city-wide fallback)", async () => {
    const out = await shapeLanes(
      [{ lane: lane({ radiusKm: 1 }), places: [place("far", { latitude: 40, longitude: 40 })], events: [] }],
      ctx({ anchorPoint: null }),
    );
    expect(out[0].places.map((p) => p.place.providerId)).toEqual(["far"]);
  });

  it("places with non-finite coords are dropped by a radius lane", async () => {
    const out = await shapeLanes(
      [{ lane: lane({ radiusKm: 5 }), places: [place("nocoord", { latitude: NaN, longitude: NaN }), place("ok", { latitude: 0.01, longitude: 0.01 })], events: [] }],
      ctx({ anchorPoint: { latitude: 0, longitude: 0 } }),
    );
    expect(out[0].places.map((p) => p.place.providerId)).toEqual(["ok"]);
  });

  it("a scorer that throws is swallowed — the lane still renders, just without the semantic blend", async () => {
    const out = await shapeLanes(
      [{ lane: lane({ semantic: true }), places: [place("a"), place("b")], events: [] }],
      ctx({ score: async () => { throw new Error("boom"); } }),
    );
    expect(out[0].places.map((p) => p.place.providerId).sort()).toEqual(["a", "b"]);
  });

  it("scorer returning partial / missing scores treats absent ids as 0", async () => {
    const out = await shapeLanes(
      [{ lane: lane({ semantic: true }), places: [place("a", { rating: 3 }), place("b", { rating: 3 })], events: [] }],
      ctx({ score: async () => ({ b: 0.9 }) }), // 'a' absent
    );
    expect(out[0].places[0].place.providerId).toBe("b"); // b boosted, a stays at +0
  });

  it("semantic lane with a single candidate skips the scorer", async () => {
    const score = vi.fn(async () => ({}));
    await shapeLanes([{ lane: lane({ semantic: true }), places: [place("solo")], events: [] }], ctx({ score }));
    expect(score).not.toHaveBeenCalled();
  });

  it("dedupe is order-sensitive across three lanes", async () => {
    const out = await shapeLanes([
      { lane: lane({ id: "a" }), places: [place("x")], events: [] },
      { lane: lane({ id: "b" }), places: [place("x"), place("y")], events: [] },
      { lane: lane({ id: "c" }), places: [place("x"), place("y"), place("z")], events: [] },
    ], ctx());
    expect(out.map((l) => [l.lane.id, l.places.map((p) => p.place.providerId)])).toEqual([
      ["a", ["x"]], ["b", ["y"]], ["c", ["z"]],
    ]);
  });

  it("a non-peek lane caps at 8", async () => {
    const many = Array.from({ length: 20 }, (_, i) => place(`p${i}`));
    const out = await shapeLanes([{ lane: lane(), places: many, events: [] }], ctx());
    expect(out[0].places).toHaveLength(8);
  });

  it("dislikes drop a matching candidate (rankCtx passthrough)", async () => {
    const out = await shapeLanes(
      [{ lane: lane(), places: [place("keep", { category: "cafe" }), place("Casino Royale", { category: "casino" })], events: [] }],
      ctx({ rankCtx: { dislikes: ["casino"] } }),
    );
    expect(out[0].places.map((p) => p.place.providerId)).toEqual(["keep"]);
  });

  it("seeded rejected ids never surface even across lanes", async () => {
    const out = await shapeLanes([
      { lane: lane({ id: "a" }), places: [place("rejected"), place("ok1")], events: [] },
      { lane: lane({ id: "b" }), places: [place("rejected"), place("ok2")], events: [] },
    ], ctx({ seenPlaceIds: new Set(["rejected"]) }));
    const all = out.flatMap((l) => l.places.map((p) => p.place.providerId));
    expect(all).not.toContain("rejected");
    expect(all.sort()).toEqual(["ok1", "ok2"]);
  });
});
