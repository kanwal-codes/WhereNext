import { describe, expect, it } from "vitest";
import { canSearch, datesLine, draftFromTrip, ideasFor, routeLine, tomorrow, travellersLine } from "@/features/flights/domain/flights-page";

const now = new Date(2026, 10, 19, 10);

describe("draftFromTrip", () => {
  it("fills from, to, days and people from a trip still ahead", () => {
    expect(draftFromTrip({ origin: " Toronto, Canada ", destination: "Montreal, Canada", start_date: "2026-11-26", end_date: "2026-11-29", travelers: 3 }, now))
      .toEqual({ fromLabel: "Toronto, Canada", toLabel: "Montreal, Canada", depart: "2026-11-26", ret: "2026-11-29", adults: 3 });
  });
  it("drops days that are not in the future, and a return without a start", () => {
    const d = draftFromTrip({ origin: "A", destination: "B", start_date: "2026-11-19", end_date: "2026-11-25" }, now);
    expect(d.depart).toBeNull();
    expect(d.ret).toBeNull();
    expect(d.adults).toBe(1);
  });
  it("keeps travellers between 1 and 9", () => {
    expect(draftFromTrip({ travelers: 40 }, now).adults).toBe(9);
    expect(draftFromTrip({ travelers: 0 }, now).adults).toBe(1);
  });
});

describe("page copy and gates", () => {
  it("needs from, to and a departure day, but not a return", () => {
    const base = { fromLabel: "Toronto", toLabel: "Paris", depart: "2026-12-31", ret: null, adults: 1 };
    expect(canSearch(base)).toBe(true);
    expect(canSearch({ ...base, depart: null })).toBe(false);
    expect(canSearch({ ...base, toLabel: "  " })).toBe(false);
  });
  it("reads dates, people and route the way a person says them", () => {
    expect(datesLine("2026-12-31", "2027-01-03")).toBe("Dec 31 – Jan 3");
    expect(datesLine("2026-12-31", null)).toBe("Dec 31");
    expect(datesLine(null, null)).toBeNull();
    expect(travellersLine(1)).toBe("1 traveller");
    expect(travellersLine(3)).toBe("3 travellers");
    expect(routeLine("Toronto, Canada", "Paris, France")).toBe("Toronto to Paris");
    expect(tomorrow(now)).toBe("2026-11-20");
  });
  it("puts the trip's own place first and never suggests where you are leaving from", () => {
    const ideas = ideasFor({ origin: "Paris, France", destination: "Rome, Italy" });
    expect(ideas[0]).toBe("Rome, Italy");
    expect(ideas.some((i) => i.startsWith("Paris"))).toBe(false);
    expect(new Set(ideas).size).toBe(ideas.length);
  });
});
