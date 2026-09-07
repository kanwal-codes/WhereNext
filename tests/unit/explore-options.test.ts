import { afterEach, describe, expect, it, vi } from "vitest";
import { buildExploreOptions } from "../../lib/application/explore-options";
import type { RetrievedEvidence } from "../../lib/application/retrieve";

const evidence = { places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" } as unknown as RetrievedEvidence;
const tripCtx = { preferences: { likes: ["cafes", "street art"] } } as never;

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
});

const stubModel = (content: unknown) => {
  process.env.AI_PROVIDER = "openai-compatible";
  process.env.AI_API_KEY = "k";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status: 200 }),
  ));
};

describe("buildExploreOptions", () => {
  it("builds an area guide block", async () => {
    stubModel({
      intro: "Base yourself in the Plateau — most walkable for your café-and-street-art list.",
      items: [
        { name: "Plateau-Mont-Royal", blurb: "Leafy, bohemian, packed with cafés and murals. Easy walk or short metro to everything.", tags: ["walkable", "cafes", "street art"], meta: "central · walkable", bestFor: "cafés & wandering" },
        { name: "Mile End", blurb: "Indie shops, bagels, music venues.", tags: ["indie", "food"], bestFor: "food crawls" },
      ],
    });
    const block = await buildExploreOptions({ kind: "area", prompt: "which neighbourhood?", tripSummary: "3 friends, Montreal", evidence, tripCtx });
    expect(block).toMatchObject({ type: "options", kind: "area" });
    const b = block as { items: Array<{ name: string; tags: string[] }> };
    expect(b.items.map((i) => i.name)).toEqual(["Plateau-Mont-Royal", "Mile End"]);
    expect(b.items[0].tags).toContain("walkable");
  });

  it("builds a day-trip block and keeps the travel-time meta", async () => {
    stubModel({
      intro: "Québec City is the standout day trip — historic and an easy train ride.",
      items: [
        { name: "Québec City", blurb: "Walled old town, château, cobbled streets.", tags: ["historic"], meta: "3h by train" },
        { name: "Mont-Tremblant", blurb: "Mountain village and trails.", tags: ["nature"], meta: "1h30 by car" },
      ],
    });
    const block = await buildExploreOptions({ kind: "daytrip", prompt: "day trips?", tripSummary: "3 friends, Montreal", evidence, tripCtx });
    expect(block).toMatchObject({ type: "options", kind: "daytrip" });
    expect((block as { items: Array<{ meta?: string }> }).items[0].meta).toBe("3h by train");
  });

  it("returns null on a bad response", async () => {
    stubModel("{}");
    expect(await buildExploreOptions({ kind: "area", prompt: "x", tripSummary: "", evidence, tripCtx })).toBeNull();
  });
});
