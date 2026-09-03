import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `embed` is mocked so the prototype set becomes the 10 orthonormal basis vectors of a
 * 10-D space (proto i = eᵢ). A query vector's cosine with proto i is then just its i-th
 * component (after normalisation) — so the test controls the score distribution directly.
 * Prototype order mirrors PROTOTYPES in classify-embed.ts: index 0 = green_space, 3 = sacred.
 */
let nextQuery: number[] = [];
vi.mock("@/packages/ai/embed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/packages/ai/embed")>();
  return {
    ...actual, // real cosine
    embed: vi.fn(async (texts: string[]) => {
      if (texts.length > 1) return texts.map((_, i) => texts.map((_, j) => (i === j ? 1 : 0)));
      return [nextQuery];
    }),
  };
});

import { classifyByEmbedding } from "@/packages/reco/classify-embed";

const e = (index: number, value = 1) => {
  const v = Array(10).fill(0);
  v[index] = value;
  return v;
};

beforeEach(() => {
  nextQuery = [];
});

describe("classifyByEmbedding threshold gate", () => {
  it("returns the vibe for a confident single-vibe hit", async () => {
    nextQuery = e(0); // pure green_space direction
    expect(await classifyByEmbedding("x")).toEqual({ vibe: "green_space", secondary: undefined });
  });

  it("returns null for a flat distribution (nothing resembles a vibe)", async () => {
    nextQuery = Array(10).fill(1); // equidistant from every prototype → ~0.316 each, ~0 margin
    expect(await classifyByEmbedding("x")).toBeNull();
  });

  it("keeps a genuine dual-vibe place (high score, low margin) and names the facet", async () => {
    nextQuery = [1, 0, 0, 0.96, 0, 0, 0, 0, 0, 0]; // strong green_space, near-equal sacred
    const r = await classifyByEmbedding("x");
    expect(r?.vibe).toBe("green_space");
    expect(r?.secondary).toBe("sacred");
  });

  it("returns null when embeddings throw", async () => {
    const { embed } = await import("@/packages/ai/embed");
    vi.mocked(embed).mockRejectedValueOnce(new Error("down"));
    nextQuery = e(0);
    expect(await classifyByEmbedding("x")).toBeNull();
  });
});
