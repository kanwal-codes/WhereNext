import { describe, expect, it } from "vitest";
import { assignDays, SAVED, type Candidate } from "../../lib/application/itinerary-days";

const cand = (name: string, kind: string, dayTrip = false): Candidate => ({ key: name, name, id: name, category: "place", kind, dayTrip });
const many = (kind: string, count: number, dayTrip = false) => Array.from({ length: count }, (_, i) => cand(`${kind}${i}`, kind, dayTrip));
const ids = (days: Candidate[][]) => days.flatMap((day) => day.map((c) => c.key));

describe("assignDays", () => {
  it("shares the pool evenly, so a small pool thins every day a little instead of emptying the last ones", () => {
    const days = assignDays({ candidates: [...many("food", 4), ...many("sights", 4), ...many("parks", 4)], days: 6, kindOrder: ["food", "sights", "parks"] });
    expect(days.map((day) => day.length)).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it("puts a place on one day only", () => {
    const days = assignDays({ candidates: [...many("food", 5), ...many("sights", 5)], days: 4, kindOrder: ["food", "sights"] });
    expect(new Set(ids(days)).size).toBe(ids(days).length);
  });

  it("mixes the kinds within a day instead of giving one day a single kind", () => {
    const days = assignDays({ candidates: [...many("food", 6), ...many("sights", 6), ...many("parks", 6)], days: 3, kindOrder: ["food", "sights", "parks"] });
    for (const day of days) expect(new Set(day.map((c) => c.kind)).size).toBeGreaterThanOrEqual(2);
  });

  it("puts a day trip's places together on one day in the middle of a longer plan", () => {
    const days = assignDays({ candidates: [...many("city", 12), ...many("falls", 3, true)], days: 5, kindOrder: ["city", "falls"] });
    const tripDay = days.findIndex((day) => day.some((c) => c.dayTrip));
    expect(tripDay).toBe(2);
    expect(days[tripDay].filter((c) => c.dayTrip)).toHaveLength(3);
    expect(days.flatMap((day, i) => (i === tripDay ? [] : day)).some((c) => c.dayTrip)).toBe(false);
  });

  it("spends no whole day travelling in a plan of one or two days, and keeps a day trip off the booked event's day", () => {
    const short = assignDays({ candidates: [...many("city", 6), ...many("falls", 3, true)], days: 2, kindOrder: ["city", "falls"] });
    expect(short.every((day) => day.length > 0 && day.filter((c) => c.dayTrip).length < 3)).toBe(true);
    const avoided = assignDays({ candidates: [...many("city", 12), ...many("falls", 3, true)], days: 5, kindOrder: ["city", "falls"], avoid: [3] });
    expect(avoided.findIndex((day) => day.some((c) => c.dayTrip))).toBe(3);
  });

  it("gives a long plan a second day trip when there is a second kind of one", () => {
    const days = assignDays({ candidates: [...many("city", 30), ...many("falls", 3, true), ...many("wine", 3, true)], days: 8, kindOrder: ["city", "falls", "wine"] });
    expect(days.filter((day) => day.some((c) => c.dayTrip))).toHaveLength(2);
  });

  it("returns an empty day only when there is nothing left to give it", () => {
    const days = assignDays({ candidates: many("city", 2), days: 4, kindOrder: ["city"] });
    expect(days.map((day) => day.length)).toEqual([1, 1, 0, 0]);
  });

  it("lets one kind fill only about a third of the days, however many places it has", () => {
    const days = assignDays({ candidates: [...many("dimsum", 12), ...many("sights", 5), ...many("parks", 5), ...many("museums", 5)], days: 6, kindOrder: ["dimsum", "sights", "parks", "museums"] });
    expect(ids(days).filter((id) => id.startsWith("dimsum")).length).toBeLessThanOrEqual(3); // of 12 stops, not one a day
    expect(days.every((day) => day.length >= 2)).toBe(true);
  });

  it("relaxes the cap when nothing else is left, and never caps the traveller's own saved places", () => {
    const only = assignDays({ candidates: many("food", 9), days: 6, kindOrder: ["food"] });
    expect(only.map((day) => day.length)).toEqual([2, 2, 2, 1, 1, 1]);
    const saved = assignDays({ candidates: [...many(SAVED, 8), ...many("sights", 8)], days: 6, kindOrder: [SAVED, "sights"] });
    expect(ids(saved).filter((id) => id.startsWith(SAVED))).toHaveLength(8);
  });
});
