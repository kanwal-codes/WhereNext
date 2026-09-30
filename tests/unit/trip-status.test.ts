import { describe, expect, it } from "vitest";
import { featuredLabel, matchesFilter, pickFeatured, sortForHome, tripCounts, tripStatus } from "../../lib/trip-status";

// Local-time noon, so "today" is unambiguous whatever timezone the tests run in.
const NOW = new Date("2026-10-10T12:00:00").getTime();
const trip = (start: string | null, end: string | null = null) => ({ start_date: start, end_date: end });

describe("tripStatus", () => {
  it("has no dates -> planning", () => {
    expect(tripStatus(trip(null), NOW)).toEqual({ phase: "undated", daysUntil: null, badge: "Planning" });
  });

  it("counts days ahead, switching unit as the trip gets further away", () => {
    expect(tripStatus(trip("2026-10-11", "2026-10-14"), NOW).badge).toBe("Tomorrow");
    expect(tripStatus(trip("2026-10-22", "2026-10-26"), NOW).badge).toBe("In 12 days");
    expect(tripStatus(trip("2026-11-14", "2026-11-20"), NOW).badge).toBe("In 5 weeks");
    expect(tripStatus(trip("2027-02-08", "2027-02-15"), NOW).badge).toBe("In 4 months");
  });

  it("is underway from the start day through the last day, then past", () => {
    expect(tripStatus(trip("2026-10-10", "2026-10-14"), NOW)).toMatchObject({ phase: "underway", badge: "Starts today" });
    expect(tripStatus(trip("2026-10-08", "2026-10-12"), NOW)).toMatchObject({ phase: "underway", badge: "Underway" });
    expect(tripStatus(trip("2026-10-08", "2026-10-10"), NOW).phase).toBe("underway");
    expect(tripStatus(trip("2026-10-05", "2026-10-09"), NOW)).toMatchObject({ phase: "past", badge: "Past" });
  });

  it("treats a trip with only a start date as a single day", () => {
    expect(tripStatus(trip("2026-10-10"), NOW).phase).toBe("underway");
    expect(tripStatus(trip("2026-10-09"), NOW).phase).toBe("past");
  });
});

describe("filters and counts", () => {
  const trips = [trip("2026-10-22", "2026-10-26"), trip("2026-10-08", "2026-10-12"), trip(null), trip("2026-01-02", "2026-01-06")];

  it("counts every phase, and folds underway into upcoming", () => {
    expect(tripCounts(trips, NOW)).toEqual({ all: 4, upcoming: 2, underway: 1, past: 1, undated: 1 });
  });

  it("matches the tab the viewer picked", () => {
    const status = tripStatus(trips[1]!, NOW);
    expect(matchesFilter(status, "upcoming")).toBe(true);
    expect(matchesFilter(status, "past")).toBe(false);
    expect(matchesFilter(status, "all")).toBe(true);
  });
});

describe("pickFeatured", () => {
  it("prefers what is happening now over everything else", () => {
    const trips = [trip("2026-10-22", "2026-10-26"), trip("2026-10-08", "2026-10-12")];
    expect(pickFeatured(trips, NOW)).toBe(trips[1]);
  });

  it("otherwise takes the soonest upcoming trip, not the first in the list", () => {
    const trips = [trip("2027-03-01", "2027-03-05"), trip("2026-10-22", "2026-10-26"), trip("2026-12-01", "2026-12-04")];
    expect(pickFeatured(trips, NOW)).toBe(trips[1]);
  });

  it("falls back to a trip still being planned, then a past one, then nothing", () => {
    const undated = trip(null);
    const past = trip("2026-01-02", "2026-01-06");
    expect(pickFeatured([past, undated], NOW)).toBe(undated);
    expect(pickFeatured([past], NOW)).toBe(past);
    expect(pickFeatured([], NOW)).toBeNull();
  });

  it("labels the featured card by phase", () => {
    expect(featuredLabel("upcoming")).toBe("Next up");
    expect(featuredLabel("underway")).toBe("Happening now");
    expect(featuredLabel("undated")).toBe("Pick up where you left off");
    expect(featuredLabel("past")).toBe("Latest trip");
  });
});

describe("sortForHome", () => {
  it("orders now, then soonest, then planning, then the most recent past trip first", () => {
    const past1 = trip("2026-01-02", "2026-01-06");
    const past2 = trip("2026-06-02", "2026-06-06");
    const later = trip("2027-03-01", "2027-03-05");
    const soon = trip("2026-10-22", "2026-10-26");
    const now = trip("2026-10-08", "2026-10-12");
    const undated = trip(null);
    expect(sortForHome([past1, later, undated, past2, soon, now], NOW)).toEqual([now, soon, later, undated, past2, past1]);
  });
});
