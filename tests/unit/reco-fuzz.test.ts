import { describe, expect, it } from "vitest";
import { classifyEventVibe, classifyPlaceVibe, lanesFor, type Vibe } from "@/packages/reco/vibes";
import { shapeLanes } from "@/packages/reco/shape-lanes";
import { cosine } from "@/packages/ai/embed";
import type { Place } from "@/packages/contracts/place";
import type { Lane } from "@/packages/reco/vibes";

const VIBES = new Set<Vibe>([
  "green_space", "live_music", "nightlife", "sacred", "expo",
  "performing_arts", "museum_culture", "beach_water", "sports", "food_scene", "default",
]);

// Deterministic PRNG so a failure is reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \t\n.,-_/\\|!@#$%^&*(){}[]<>?;:'\"`~ " +
  "gardenparkтемплеمتحفстадион museum temple stadium beach club concert expo 🏛️⛩️🏟️🎸🏖️🍺🎭 " +
  "château jardín 神社 教会 مسجد " +
  "​‌‍﻿"; // zero-width chars

function randomName(rand: () => number): string {
  const len = Math.floor(rand() * 120);
  let s = "";
  for (let i = 0; i < len; i += 1) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}

describe("classifyPlaceVibe / lanesFor — 3,000 random garbage names", () => {
  it("never throws, always returns a valid vibe + a usable lane list", () => {
    const rand = mulberry32(12345);
    for (let i = 0; i < 3000; i += 1) {
      const name = randomName(rand);
      const types = rand() < 0.3 ? Array.from({ length: Math.floor(rand() * 5) }, () => randomName(rand)) : undefined;
      const primaryType = rand() < 0.5 ? randomName(rand).slice(0, 20) : undefined;

      let r: { vibe: Vibe; secondary?: Vibe };
      expect(() => {
        r = classifyPlaceVibe({ name, types, primaryType });
      }, `threw on name=${JSON.stringify(name).slice(0, 60)}`).not.toThrow();

      r = classifyPlaceVibe({ name, types, primaryType });
      expect(VIBES.has(r.vibe), `bad vibe "${r.vibe}" from ${JSON.stringify(name).slice(0, 60)}`).toBe(true);
      if (r.secondary) expect(VIBES.has(r.secondary)).toBe(true);

      const lanes = lanesFor(r.vibe, r.secondary);
      expect(lanes.length).toBeGreaterThanOrEqual(3);
      expect(new Set(lanes.map((l) => l.id)).size).toBe(lanes.length);
      for (const l of lanes) {
        expect(["places", "events"]).toContain(l.source);
        expect(typeof (typeof l.query === "function" ? l.query({ name, city: "x" }) : l.query)).toBe("string");
      }
    }
  });
});

describe("classifyEventVibe — 2,000 random garbage events", () => {
  it("never throws, always a valid vibe", () => {
    const rand = mulberry32(777);
    for (let i = 0; i < 2000; i += 1) {
      const ev = {
        title: rand() < 0.8 ? randomName(rand) : undefined,
        venue: rand() < 0.5 ? randomName(rand) : undefined,
        tmSegment: rand() < 0.3 ? randomName(rand).slice(0, 15) : undefined,
      };
      let v: Vibe = "default";
      expect(() => {
        v = classifyEventVibe(ev);
      }, `threw on ${JSON.stringify(ev).slice(0, 80)}`).not.toThrow();
      expect(VIBES.has(v)).toBe(true);
    }
  });
});

describe("cosine — pathological vectors", () => {
  it("handles NaN / Infinity / zero / mismatched-length without throwing", () => {
    expect(() => cosine([NaN, 1], [1, 1])).not.toThrow();
    expect(() => cosine([Infinity, 0], [1, 0])).not.toThrow();
    expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(() => cosine([1, 2, 3], [1])).not.toThrow(); // length mismatch: iterates the shorter
    expect(cosine([], [])).toBe(0);
    const big = Array.from({ length: 1536 }, () => 0.02);
    expect(cosine(big, big)).toBeCloseTo(1, 5);
  });
});

describe("shapeLanes — messy rankCtx and result shapes", () => {
  const place = (id: string, over: Partial<Place> = {}): Place => ({
    provider: "google-places", providerId: id, name: id, category: "restaurant",
    latitude: 0, longitude: 0, address: null, rating: 4, userRatingCount: 100, sourceUrl: null, ...over,
  });
  const lane = (over: Partial<Lane> = {}): Lane => ({ id: "l", title: "L", source: "places", query: "q", ...over });

  it("survives dislikes/interests that are strings, huge, or full of junk", async () => {
    const ctx = {
      seenPlaceIds: new Set<string>(),
      seenEventUrls: new Set<string>(),
      anchorPoint: null,
      rankCtx: {
        dislikes: "casino" as unknown as string[],                        // wrong type
        interests: Array.from({ length: 5000 }, (_, i) => `interest${i}`), // huge
        likes: ["", "  ", "🎸", "'; DROP--", "x".repeat(500)] as string[],
      },
    };
    const out = await shapeLanes([{ lane: lane(), places: [place("a"), place("b")], events: [] }], ctx);
    expect(out[0].places.length).toBeGreaterThan(0);
  });

  it("a semantic scorer that returns a non-object / null / array / throws does not crash the blend", async () => {
    const bogusValues: unknown[] = [null, undefined, [1, 2, 3], "nope", 42, { a: NaN }, { a: Infinity }];
    for (const bogus of bogusValues) {
      const out = await shapeLanes(
        [{ lane: lane({ semantic: true }), places: [place("a"), place("b")], events: [] }],
        { seenPlaceIds: new Set<string>(), seenEventUrls: new Set<string>(), anchorPoint: null, rankCtx: {}, score: async () => bogus as Record<string, number> },
      );
      expect(out[0].places.length, `bogus=${JSON.stringify(bogus)}`).toBeGreaterThan(0);
    }
    // a scorer that throws is swallowed, not propagated
    const out = await shapeLanes(
      [{ lane: lane({ semantic: true }), places: [place("a"), place("b")], events: [] }],
      { seenPlaceIds: new Set<string>(), seenEventUrls: new Set<string>(), anchorPoint: null, rankCtx: {}, score: async () => { throw new Error("boom"); } },
    );
    expect(out[0].places.length).toBe(2);
  });
});
