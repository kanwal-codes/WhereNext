import { describe, expect, it } from "vitest";
import { currentTripDay, detectMealAsk, inferMealAnchor } from "../../lib/application/itinerary-anchor";
import type { TripContext } from "../../lib/application/trip-context";

describe("detectMealAsk", () => {
  it("recognizes each meal keyword", () => {
    expect(detectMealAsk("where should I get breakfast")).toBe("breakfast");
    expect(detectMealAsk("looking for a lunch spot")).toBe("lunch");
    expect(detectMealAsk("brunch anywhere nearby?")).toBe("lunch");
    expect(detectMealAsk("good place for dinner tonight")).toBe("dinner");
  });

  it("returns null for a message with no meal keyword", () => {
    expect(detectMealAsk("what's good to eat around here")).toBeNull();
    expect(detectMealAsk("any restaurants nearby")).toBeNull();
  });
});

describe("currentTripDay", () => {
  it("returns null when the trip has no start date", () => {
    expect(currentTripDay(null, 5, new Date("2026-10-11T18:00:00"))).toBeNull();
  });

  it("returns null before the trip starts", () => {
    expect(currentTripDay("2026-10-10", 5, new Date("2026-09-17T12:00:00"))).toBeNull();
  });

  it("returns null after the trip's last day", () => {
    expect(currentTripDay("2026-10-10", 5, new Date("2026-10-20T12:00:00"))).toBeNull();
  });

  it("maps 'now' to the right in-trip day", () => {
    expect(currentTripDay("2026-10-10", 5, new Date("2026-10-10T09:00:00"))).toBe(1);
    expect(currentTripDay("2026-10-10", 5, new Date("2026-10-12T21:00:00"))).toBe(3);
    expect(currentTripDay("2026-10-10", 5, new Date("2026-10-14T23:59:00"))).toBe(5);
  });
});

describe("inferMealAnchor", () => {
  const itinerary: TripContext["itinerary"] = [
    { title: "Breakfast at Cafe Olimpico", day_index: 1, position: 0, locked: true, latitude: 45.52, longitude: -73.6, time: "08:00" },
    { title: "Walk through Old Montreal", day_index: 2, position: 0, locked: false, latitude: 45.505, longitude: -73.557, time: "16:00" },
    { title: "Visit Mount Royal Park", day_index: 2, position: 1, locked: false, latitude: 45.5016, longitude: -73.5932, time: "18:30" },
    { title: "Untimed stop", day_index: 2, position: 2, locked: false, latitude: 45.51, longitude: -73.58 }, // no `time`
  ];

  it("finds the itinerary stop whose real, set time falls in the meal window", () => {
    const anchor = inferMealAnchor(itinerary, "dinner", 2);
    expect(anchor).toMatchObject({ title: "Visit Mount Royal Park", dayIndex: 2 });
  });

  it("returns null when no stop on that day has a time in the window — never guesses from position", () => {
    expect(inferMealAnchor(itinerary, "breakfast", 2)).toBeNull(); // nothing on day 2 timed before 11am
    expect(inferMealAnchor(itinerary, "lunch", 2)).toBeNull(); // "Untimed stop" has no time at all
  });

  it("ignores a matching time on the wrong day", () => {
    expect(inferMealAnchor(itinerary, "breakfast", 2)).toBeNull(); // the 08:00 breakfast is day 1, not day 2
  });

  it("ignores an item with a matching time but no coordinates", () => {
    const noCoords: TripContext["itinerary"] = [{ title: "TBD dinner spot", day_index: 1, locked: false, time: "19:00" }];
    expect(inferMealAnchor(noCoords, "dinner", 1)).toBeNull();
  });
});
