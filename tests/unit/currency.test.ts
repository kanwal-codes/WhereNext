import { describe, expect, it } from "vitest";
import { roundMoney } from "../../lib/currency";

describe("roundMoney", () => {
  // Live-testing finding: plain `.toFixed(2)` mis-rounds several realistic 3-decimal money
  // values because of IEEE754 binary float representation — e.g. 1.005 is actually stored as
  // 1.00499999999999989341..., so `(1.005).toFixed(2)` is "1.00", not "1.01". This bit the
  // Splitwise expenses feature: the local trip_expenses row stored the raw, unrounded amount
  // while Splitwise got a separately (and sometimes differently) rounded one, permanently
  // diverging the two records for any amount typed with 3+ decimal places.
  it("rounds x.xx5 boundary values correctly, unlike toFixed(2)", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(0.615)).toBe(0.62);
    expect(roundMoney(1.045)).toBe(1.05);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(100.005)).toBe(100.01);
  });

  it("confirms toFixed(2) actually gets at least some of these wrong (the bug this guards against)", () => {
    expect((1.005).toFixed(2)).toBe("1.00"); // the known-broken case, pinned so this test fails loudly if V8 ever changes
    expect(roundMoney(1.005).toFixed(2)).toBe("1.01");
  });

  it("leaves an already-2-decimal amount unchanged", () => {
    expect(roundMoney(35.85)).toBe(35.85);
    expect(roundMoney(10)).toBe(10);
  });

  it("rounds ordinary (non-boundary) values the same way toFixed would", () => {
    expect(roundMoney(12.344)).toBe(12.34);
    expect(roundMoney(12.346)).toBe(12.35);
  });

  it("handles zero and small values without crashing", () => {
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(0.001)).toBe(0);
    expect(roundMoney(0.005)).toBe(0.01);
  });
});
