import { describe, expect, it } from "vitest";
import { formatDuration, layoverRisk, offerRisks } from "../../lib/application/flight-risks";
import { tradeoff } from "../../lib/application/flight-tradeoff";

describe("durations", () => {
  it("says hours and minutes the way a traveller does, and drops a whole hour's zero minutes", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(75)).toBe("1h 15m");
    expect(formatDuration(425)).toBe("7h 05m");
    expect(formatDuration(600)).toBe("10h");
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("layover risks", () => {
  it("flags tight under 45 min, long from 6 h, and overnight, and leaves an ordinary wait alone", () => {
    expect(layoverRisk({ layoverMinutes: 40 })).toBe("Tight connection: 40 min");
    expect(layoverRisk({ layoverMinutes: 45 })).toBeNull();
    expect(layoverRisk({ layoverMinutes: 75 })).toBeNull();
    expect(layoverRisk({ layoverMinutes: 359 })).toBeNull();
    expect(layoverRisk({ layoverMinutes: 405 })).toBe("Long layover: 6h 45m");
    expect(layoverRisk({ layoverMinutes: 600, overnight: true })).toBe("Overnight layover: 10h");
    expect(layoverRisk({})).toBeNull();
  });

  it("lists a fare's risks in the order met, naming a late flight once", () => {
    expect(offerRisks([{ layoverMinutes: 40 }, { layoverMinutes: 420, oftenDelayed: true }, { oftenDelayed: true }])).toEqual(["Tight connection: 40 min", "Long layover: 7h", "Often over 30 min late"]);
    expect(offerRisks(undefined)).toEqual([]);
  });
});

describe("the cheapest against the fastest", () => {
  const fares = [{ price: 2207, minutes: 1030, stops: 1 }, { price: 1846, minutes: 1575, stops: 2 }, { price: 2658, minutes: 880, stops: 0 }];
  it("reports what the cheapest saves and what it costs in time", () => {
    const t = tradeoff(fares)!;
    expect(t).toMatchObject({ cheapest: 1, fastest: 2, same: false, saves: 812, savesPct: 31, extraMinutes: 695, verdict: "real saving", fastestIsNonstop: true });
  });
  it("calls a tiny saving small and a same-time one not slower, and has nothing to say for one fare", () => {
    expect(tradeoff([{ price: 1000, minutes: 600, stops: 0 }, { price: 970, minutes: 1000, stops: 1 }])!.verdict).toBe("small saving");
    expect(tradeoff([{ price: 1000, minutes: 600, stops: 0 }, { price: 900, minutes: 610, stops: 1 }])!.verdict).toBe("not slower");
    expect(tradeoff([{ price: 800, minutes: 500, stops: 0 }, { price: 900, minutes: 700, stops: 1 }])!.same).toBe(true);
    expect(tradeoff([{ price: Number.NaN, minutes: 0, stops: 0 }])).toBeNull();
  });
});
