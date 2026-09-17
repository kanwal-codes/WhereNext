import { describe, expect, it } from "vitest";
import { daysUntilTrip, fmtDay, tripDayIndex, tripWhen } from "../../lib/trip-dates";

const at = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

// Montreal QA pass (2026-09-16): live-caught six duplicated copies of this exact function (five
// missing the local-time parse entirely) rendering trip dates 2026-10-10 → 2026-10-14 as
// "Oct 9 → Oct 13" on the Stay page — a bare "YYYY-MM-DD" parses as UTC midnight, which
// `toLocaleDateString` then renders in the runtime's local zone, landing on the previous day for
// any zone behind UTC. This must hold regardless of the machine's own timezone (CI included).
describe("fmtDay", () => {
  it("never shifts to the previous day regardless of the runtime's own timezone", () => {
    expect(fmtDay("2026-10-10")).toBe("Oct 10");
    expect(fmtDay("2026-01-01")).toBe("Jan 1");
    expect(fmtDay("2026-12-31")).toBe("Dec 31");
  });
  it("falls back to the raw string for an unparseable date", () => {
    expect(fmtDay("not-a-date")).toBe("not-a-date");
  });
});

describe("daysUntilTrip", () => {
  it("counts up to a future start date", () => {
    expect(daysUntilTrip("2026-03-20", at("2026-03-14"))).toBe(6);
  });
  it("is zero on the start date, negative once the trip has started", () => {
    expect(daysUntilTrip("2026-03-14", at("2026-03-14"))).toBe(0);
    expect(daysUntilTrip("2026-03-14", at("2026-03-17"))).toBe(-3);
  });
  it("is null without a start date or with a bad one", () => {
    expect(daysUntilTrip(null)).toBeNull();
    expect(daysUntilTrip("not-a-date", at("2026-03-14"))).toBeNull();
  });
});

describe("tripDayIndex", () => {
  it("is day 1 on the start date", () => {
    expect(tripDayIndex("2026-03-14", at("2026-03-14"))).toBe(1);
  });
  it("counts elapsed days inclusively", () => {
    expect(tripDayIndex("2026-03-14", at("2026-03-17"))).toBe(4);
  });
  it("is null before the trip starts", () => {
    expect(tripDayIndex("2026-03-14", at("2026-03-10"))).toBeNull();
  });
  it("is null without a start date or with a bad one", () => {
    expect(tripDayIndex(null)).toBeNull();
    expect(tripDayIndex("not-a-date", at("2026-03-14"))).toBeNull();
  });
});

describe("tripWhen", () => {
  it("shows a dated range with the day count", () => {
    expect(tripWhen("2026-03-14", "2026-03-20")).toMatch(/\(7 days\)/);
  });
  it("falls back to a bare length, then to empty", () => {
    expect(tripWhen(null, null, 5)).toBe("5 days");
    expect(tripWhen(null, null, null)).toBe("Not set");
  });
});
