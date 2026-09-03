import { describe, expect, it } from "vitest";
import { costUsd, estimateTokens } from "../../lib/ai/pricing";

describe("costUsd", () => {
  it("prices a known model per its $/1M rate", () => {
    // gpt-4o: $2.5/1M in, $10/1M out
    expect(costUsd("gpt-4o", 1_000_000, 1_000_000)).toBeCloseTo(12.5);
    expect(costUsd("gpt-4o", 500, 200)).toBeCloseTo(500 / 1e6 * 2.5 + 200 / 1e6 * 10);
  });

  it("uses the cheap Cerebras rate for gpt-oss-120b", () => {
    expect(costUsd("gpt-oss-120b", 1_000_000, 1_000_000)).toBeCloseTo(0.75);
  });

  it("falls back to the default rate for an unknown or missing model", () => {
    const expected = 1_000_000 / 1e6 * 0.5 + 1_000_000 / 1e6 * 1.5;
    expect(costUsd("some-new-model", 1_000_000, 1_000_000)).toBeCloseTo(expected);
    expect(costUsd(undefined, 1_000_000, 1_000_000)).toBeCloseTo(expected);
  });

  it("is zero for zero tokens", () => {
    expect(costUsd("gpt-4o", 0, 0)).toBe(0);
  });
});

describe("estimateTokens", () => {
  it("is ceil(chars / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("x".repeat(4000))).toBe(1000);
  });
});
