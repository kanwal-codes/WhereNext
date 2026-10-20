import { describe, expect, it } from "vitest";
import { MAX_DAY_ROWS, dayRowCount, derivePlacement, isSaved, menuPlacement, placementToast, samePlacement } from "../../features/trip/domain/placement-control";

const place = { name: "Louvre", providerId: "p1" };

describe("samePlacement", () => {
  it("compares by value", () => {
    expect(samePlacement({ dayIndex: 2 }, { dayIndex: 2 })).toBe(true);
    expect(samePlacement({ dayIndex: 2 }, { dayIndex: 3 })).toBe(false);
    expect(samePlacement("none", "shortlist")).toBe(false);
    expect(samePlacement("none", "none")).toBe(true);
  });
});

describe("isSaved", () => {
  it("accepts each shape a saved row comes in", () => {
    expect(isSaved([{ places: { provider_id: "p1" } }], "p1")).toBe(true);
    expect(isSaved([{ provider_id: "p1" }], "p1")).toBe(true);
    expect(isSaved([{ providerId: "p1" }], "p1")).toBe(true);
    expect(isSaved([{ places: null }, {}], "p1")).toBe(false);
    expect(isSaved([], "p1")).toBe(false);
  });
});

describe("placementToast", () => {
  it("says what happened", () => {
    expect(placementToast("Louvre", { dayIndex: 3 })).toBe("Louvre added to Day 3.");
    expect(placementToast("Louvre", "shortlist")).toBe("Louvre shortlisted.");
    expect(placementToast("Louvre", "none")).toBe("Removed Louvre from the trip.");
  });
});

describe("derivePlacement", () => {
  it("prefers an explicit placement", () => {
    expect(derivePlacement({ initialPlacement: "shortlist", itinerary: [{ title: "Louvre", day_index: 2 }], savedPlaces: [], place })).toBe("shortlist");
  });
  it("finds a place on the itinerary by name, ignoring case and spacing, defaulting to day 1 without a day", () => {
    expect(derivePlacement({ itinerary: [{ title: "  louvre ", day_index: 4 }], savedPlaces: [], place })).toEqual({ dayIndex: 4 });
    expect(derivePlacement({ itinerary: [{ title: "Louvre" }], savedPlaces: [], place })).toEqual({ dayIndex: 1 });
  });
  it("falls back to the shortlist, then to not in the trip", () => {
    expect(derivePlacement({ itinerary: [], savedPlaces: [{ provider_id: "p1" }], place })).toBe("shortlist");
    expect(derivePlacement({ itinerary: [{ title: "Orsay", day_index: 1 }], savedPlaces: [], place })).toBe("none");
  });
});

describe("dayRowCount", () => {
  it("is the trip's length, or the latest day in use if later, up to the cap", () => {
    expect(dayRowCount(3, [])).toBe(3);
    expect(dayRowCount(2, [{ day_index: 5 }, { day_index: 1 }])).toBe(5);
    expect(dayRowCount(90, [])).toBe(MAX_DAY_ROWS);
    expect(dayRowCount(0, [])).toBe(0);
  });
});

describe("menuPlacement", () => {
  const view = { width: 1000, height: 800 };
  it("opens under the control with its right edge on the control's", () => {
    expect(menuPlacement({ top: 100, bottom: 140, right: 300 }, view)).toEqual({ top: 146, left: 60, up: false });
  });
  it("opens above when there is little room below", () => {
    expect(menuPlacement({ top: 650, bottom: 690, right: 400 }, view)).toEqual({ top: 644, left: 160, up: true });
    expect(menuPlacement({ top: 2, bottom: 30, right: 400 }, { width: 1000, height: 300 }).top).toBe(8);
  });
  it("stays on screen at either side", () => {
    expect(menuPlacement({ top: 0, bottom: 10, right: 100 }, view).left).toBe(8);
    expect(menuPlacement({ top: 0, bottom: 10, right: 5000 }, view).left).toBe(752);
  });
});
