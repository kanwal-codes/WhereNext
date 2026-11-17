import { describe, expect, it } from "vitest";
import { closedThatDay, isTransitStop, planScore } from "../../lib/application/plan-check";
import { closedOnDay } from "../../lib/place-hours";

const WEEK = [
  "Monday: Closed",
  "Tuesday: 10:00 AM – 6:00 PM",
  "Wednesday: Open 24 hours",
  "Thursday: 12:00 – 3:00 PM, 6:00 – 11:00 PM",
  "Friday: 8:00 PM – 2:00 AM",
  "Saturday: 9:00 AM – 5:00 PM",
  "Sunday: Closed",
];

describe("closedOnDay", () => {
  it("is true only for a line that says Closed", () => {
    expect(closedOnDay(WEEK, 1)).toBe(true);
    expect(closedOnDay(WEEK, 0)).toBe(true);
    for (const day of [2, 3, 4, 5, 6]) expect(closedOnDay(WEEK, day)).toBe(false);
  });
  it("never guesses a closure from missing, partial or unreadable lines", () => {
    expect(closedOnDay(undefined, 1)).toBe(false);
    expect(closedOnDay([], 1)).toBe(false);
    expect(closedOnDay(["Tuesday: see website"], 2)).toBe(false);
    expect(closedOnDay(["Tuesday: Closed"], 1)).toBe(false);
  });
});

describe("closedThatDay", () => {
  it("reads the weekday of a calendar date (2026-11-16 is a Monday)", () => {
    expect(closedThatDay(WEEK, "2026-11-16")).toBe(true);
    expect(closedThatDay(WEEK, "2026-11-17")).toBe(false);
    expect(closedThatDay(undefined, "2026-11-16")).toBe(false);
  });
});

describe("isTransitStop", () => {
  it("knows stations, terminals, airports and ports from the place type or the stop kind", () => {
    expect(isTransitStop({}, "ferry_terminal")).toBe(true);
    expect(isTransitStop({}, "train_station")).toBe(true);
    expect(isTransitStop({}, "marina")).toBe(true);
    expect(isTransitStop({ kind: "transit" }, "restaurant")).toBe(true);
    expect(isTransitStop({ kind: "food" }, "seafood_restaurant")).toBe(false);
    expect(isTransitStop({}, null)).toBe(false);
  });
});

describe("planScore", () => {
  it("counts thin, open, transit and one-kind days", () => {
    const score = planScore([
      { stops: [{ title: "a", kind: "food" }, { title: "b", kind: "food" }, { title: "c", kind: "food" }] },
      { stops: [{ title: "d", kind: "transit" }] },
      { stops: [], open: true },
    ]);
    expect(score).toEqual({ days: 3, stops: 4, openDays: 1, thinDays: 1, transit: 1, oneKindDays: 1 });
  });
});
