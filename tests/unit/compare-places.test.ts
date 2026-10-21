import { describe, expect, it } from "vitest";
import { compareAnchors, compareRows, compareStats, hoursToday, hoursTodayShort } from "../../features/places/domain/compare-places";

const WEEK = ["Monday: 9:00 AM – 6:00 PM", "Tuesday: 9:00 AM – 7:00 PM", "Wednesday: 10:00 AM – 8:00 PM", "Thursday: Closed", "Friday: x", "Saturday: x", "Sunday: Closed"];
const place = (over: Record<string, unknown> = {}) => ({ displayName: { text: "P" }, rating: 4.5, userRatingCount: 100, priceLevel: "PRICE_LEVEL_MODERATE", location: { latitude: 48.86, longitude: 2.34 }, regularOpeningHours: { weekdayDescriptions: WEEK }, ...over }) as never;
const stay = { kind: "stay", value: { provider: "liteapi", hotelId: "h", hotelName: "Hotel X", roomName: "R", board: null, refundable: true, checkin: "2026-12-01", checkout: "2026-12-04", nights: 3, nightlyAmount: 1, totalAmount: 3, currency: "EUR", latitude: 48.86, longitude: 2.34, address: null, thumbnail: null } };

describe("compareAnchors", () => {
  it("measures from the locked stay when it has a place", () => {
    const { anchors, distanceLabel } = compareAnchors([stay], [{ title: "Dinner", metadata: { locked: true, latitude: 1, longitude: 2 } }]);
    expect(anchors).toEqual([{ title: "Hotel X", latitude: 48.86, longitude: 2.34 }]);
    expect(distanceLabel).toBe("From your stay");
  });

  it("else from the locked plans that have a place", () => {
    const { anchors, distanceLabel } = compareAnchors([], [
      { title: "Dinner", metadata: { locked: true, latitude: 1, longitude: 2 } },
      { title: "Idea", metadata: { latitude: 3, longitude: 4 } },
      { title: "No place", metadata: { locked: true } },
      { title: 5, metadata: { locked: true, latitude: 6, longitude: 7 } },
      { title: "Bad", metadata: { locked: true, latitude: "6", longitude: 7 } },
      { title: "Nan", metadata: { locked: true, latitude: Number.NaN, longitude: 7 } },
    ]);
    expect(anchors).toEqual([{ title: "Dinner", latitude: 1, longitude: 2 }]);
    expect(distanceLabel).toBe("From your plans");
  });

  it("has nothing to measure from otherwise, including a stay without coordinates", () => {
    expect(compareAnchors([], [])).toEqual({ anchors: [], distanceLabel: null });
    const noPlace = { ...stay, value: { ...stay.value, latitude: null, longitude: null } };
    expect(compareAnchors([noPlace], []).distanceLabel).toBeNull();
  });
});

describe("compareRows", () => {
  it("slots the distance row in before Hours", () => {
    expect(compareRows("From your stay").map((r) => r.key)).toEqual(["category", "rating", "reviews", "price", "distance", "hours", "source"]);
    expect(compareRows("From your stay")[4].label).toBe("From your stay");
    expect(compareRows(null).map((r) => r.key)).toEqual(["category", "rating", "reviews", "price", "hours", "source"]);
  });
});

describe("compareStats", () => {
  const anchors = [{ title: "Hotel", latitude: 48.86, longitude: 2.34 }];

  it("finds the best rating, most reviews and lowest price", () => {
    const s = compareStats([place({ rating: 4.2, userRatingCount: 50, priceLevel: "PRICE_LEVEL_EXPENSIVE" }), place({ rating: 4.8, userRatingCount: 900, priceLevel: "PRICE_LEVEL_INEXPENSIVE" })], []);
    expect(s.bestRating).toBe(4.8);
    expect(s.mostReviews).toBe(900);
    expect(s.bestPrice).toBe(1);
  });

  it("uses -1 for what nobody has", () => {
    const s = compareStats([place({ rating: undefined, userRatingCount: undefined, priceLevel: undefined })], []);
    expect(s.bestRating).toBe(-1);
    expect(s.mostReviews).toBe(-1);
    expect(s.bestPrice).toBe(99);
    expect(s.closestKm).toBe(-1);
  });

  it("measures each place to its nearest anchor and finds the closest", () => {
    const near = place({ location: { latitude: 48.86, longitude: 2.34 } });
    const far = place({ location: { latitude: 48.9, longitude: 2.4 } });
    const noPlace = place({ location: undefined });
    const s = compareStats([near, far, noPlace], anchors);
    expect(s.distanceKm(near)).toBeCloseTo(0, 5);
    expect(s.distanceKm(far)).toBeGreaterThan(3);
    expect(s.distanceKm(noPlace)).toBeNull();
    expect(s.closestKm).toBeCloseTo(0, 5);
    expect(compareStats([near], []).distanceKm(near)).toBeNull();
  });
});

describe("hoursToday", () => {
  const wed = new Date("2026-12-02T12:00:00");
  const sun = new Date("2026-12-06T12:00:00");

  it("reads today's line from the week, Sunday last", () => {
    expect(hoursToday(place(), wed)).toBe("Wednesday: 10:00 AM – 8:00 PM");
    expect(hoursToday(place(), sun)).toBe("Sunday: Closed");
    expect(hoursToday(place(), new Date("2026-11-30T12:00:00"))).toBe("Monday: 9:00 AM – 6:00 PM");
  });

  it("says 'See listing' when the place gives no hours", () => {
    expect(hoursToday(place({ regularOpeningHours: undefined }), wed)).toBe("See listing");
  });

  it("shortens it for a narrow column: no weekday, no break before AM/PM", () => {
    expect(hoursTodayShort(place(), wed)).toBe("10:00 AM – 8:00 PM");
    expect(hoursTodayShort(place({ regularOpeningHours: undefined }), wed)).toBe("See listing");
    expect(hoursTodayShort(place(), sun)).toBe("Closed");
  });
});
