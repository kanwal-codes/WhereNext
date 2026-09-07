import { describe, expect, it } from "vitest";
import { cosine } from "@/packages/ai/embed";

describe("cosine", () => {
  it("is 1 for identical direction, 0 for orthogonal, -1 for opposite", () => {
    expect(cosine([1, 0, 0], [2, 0, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  it("does not divide by zero on a zero vector", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});
