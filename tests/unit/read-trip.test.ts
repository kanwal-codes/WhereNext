import { describe, expect, it } from "vitest";
import { readTrip } from "@/lib/landing/readTrip";

describe("readTrip (the boarding pass reads a sentence)", () => {
  it("reads all four fields and the place from one sentence", () => {
    expect(readTrip("Four of us, Montreal, Oct 16–19, $900 each, no museums")).toEqual({
      people: "4 people",
      dates: "Oct 16–19",
      budget: "$900 each",
      style: "No museums",
      place: { code: "YUL", name: "Montreal" },
    });
  });

  it("combines a length of stay with a month", () => {
    const r = readTrip("Solo week in Kyoto in April, quiet temples, great ramen");
    expect(r).toMatchObject({ people: "Just you", dates: "A week · April", style: "Quiet, Food", place: { code: "KYO" } });
  });

  it("reads a ceiling and does not mistake where you leave from for where you go", () => {
    const r = readTrip("Somewhere warm in November, under $1,500, direct from Toronto");
    expect(r).toMatchObject({ dates: "November", budget: "Under $1,500", style: "Warm" });
    expect(r.place).toBeUndefined();
  });

  it("counts friends as people on top of the writer", () => {
    expect(readTrip("A long weekend in Montreal with three friends").people).toBe("4 people");
    expect(readTrip("trip with 1 friend").people).toBe("2 people");
  });

  it("leaves unclear things empty instead of guessing", () => {
    expect(readTrip("Somewhere nice, I may go in the spring")).toEqual({ people: undefined, dates: undefined, budget: undefined, style: undefined, place: undefined });
    expect(readTrip("   ")).toEqual({});
  });

  it("reads days, nights and k amounts", () => {
    expect(readTrip("Four days in Lisbon, mostly on foot and at the table")).toMatchObject({ dates: "4 days", style: "On foot, Food", place: { code: "LIS" } });
    expect(readTrip("3 nights in Rome, up to €2k").budget).toBe("Under €2,000");
  });
});
