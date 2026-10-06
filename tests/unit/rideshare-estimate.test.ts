import { describe, expect, it } from "vitest";
import { estimateRideshare } from "@/lib/application/rideshare-estimate";

describe("estimateRideshare", () => {
  it("returns a low/high range that brackets the point estimate, plus minutes and currency", () => {
    const result = estimateRideshare(10_000, 900, "CAD");
    expect(result.low).toBeLessThan(result.high);
    expect(result.minutes).toBe(15);
    expect(result.currency).toBe("CAD");
    expect(result.low).toBeGreaterThan(0);
  });

  it("scales up with distance and duration", () => {
    const short = estimateRideshare(2_000, 300);
    const long = estimateRideshare(20_000, 1800);
    expect(long.low).toBeGreaterThan(short.low);
    expect(long.high).toBeGreaterThan(short.high);
  });

  it("converts the dollar-based estimate into the traveller's currency", () => {
    const usd = estimateRideshare(100_000, 3600);
    const cad = estimateRideshare(100_000, 3600, "CAD", 1.4);
    expect(cad.currency).toBe("CAD");
    expect(Math.abs(cad.low - usd.low * 1.4)).toBeLessThanOrEqual(1);
    expect(Math.abs(cad.high - usd.high * 1.4)).toBeLessThanOrEqual(1);
  });
});
