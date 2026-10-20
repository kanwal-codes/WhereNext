import { describe, expect, it } from "vitest";
import { buildPins, dayDate, dayNumbers, dayOverlayFor, daysShown, mapLegsFor, modesDrawn } from "../../features/maps/domain/map-view";
import type { RoutePlan } from "../../packages/contracts/route-plan";

const day = (n: number, over: Record<string, unknown> = {}) => ({ day: n, stops: [], legs: [], summary: { movingMinutes: 0, transitRides: 0, fare: null }, ...over });
const leg = (over: Record<string, unknown> = {}) => ({ mode: "walk", minutes: 5, steps: [], polyline: [[0, 0], [1, 1]], ...over });
const plan = (days: unknown[]) => ({ days, unplaced: [] }) as unknown as RoutePlan;
const planDays = (days: unknown[]) => plan(days).days;
const kindOf = () => "saved" as const;

describe("dayDate", () => {
  it("counts days from the start date", () => {
    expect(dayDate("2026-12-01", 1)).toBe("Tue, Dec 1");
    expect(dayDate("2026-12-01", 3)).toBe("Thu, Dec 3");
  });
  it("is null without a usable start date", () => {
    expect(dayDate(null, 1)).toBeNull();
    expect(dayDate("nonsense", 1)).toBeNull();
  });
});

describe("buildPins", () => {
  const base = { itinerary: [], saved: [], plan: null, stay: null, tripId: "t", kindOf };
  it("ignores itinerary stops with no usable location", () => {
    const itinerary = [
      { id: "a", title: "A", day_index: 1, metadata: { latitude: 1, longitude: 2 } },
      { id: "b", title: "B", day_index: 1, metadata: { latitude: 0, longitude: 0 } },
      { id: "c", title: "C", day_index: 1, metadata: null },
    ];
    expect(buildPins({ ...base, itinerary }).map((p) => p.id)).toEqual(["it-a"]);
  });
  it("takes plan stops the itinerary row lacks, once", () => {
    const itinerary = [{ id: "a", title: "A", day_index: 1, metadata: { latitude: 1, longitude: 2 } }];
    const p = plan([day(1, { stops: [{ id: "a", name: "A", lat: 1, lng: 2 }, { id: "z", name: "Z", lat: 3, lng: 4 }] })]);
    expect(buildPins({ ...base, itinerary, plan: p }).map((x) => x.id)).toEqual(["it-a", "it-z"]);
  });
  it("skips a saved place where something is already pinned, and puts the stay first", () => {
    const itinerary = [{ id: "a", title: "A", day_index: 1, metadata: { latitude: 1, longitude: 2 } }];
    const saved = [
      { places: { id: "s1", name: "Dup", metadata: { latitude: 1.00001, longitude: 2.00001 } } },
      { places: { id: "s2", name: "New", metadata: { latitude: 5, longitude: 6 } } },
    ];
    const pins = buildPins({ ...base, itinerary, saved, stay: { hotelId: "h", hotelName: "Hotel", latitude: 9, longitude: 8 } });
    expect(pins.map((p) => p.id)).toEqual(["stay", "it-a", "s2"]);
  });
  it("leaves the stay off the map when it has no location", () => {
    expect(buildPins({ ...base, stay: { hotelId: "h", hotelName: "Hotel", latitude: null, longitude: null } })).toEqual([]);
  });
});

describe("dayNumbers and daysShown", () => {
  it("lists each day once, sorted, from pins and plan", () => {
    const pins = [{ day: 2 }, { day: 2 }, {}, { day: 1 }] as never;
    expect(dayNumbers(pins, plan([day(3), day(1)]))).toEqual([1, 2, 3]);
    expect(dayNumbers([], null)).toEqual([]);
  });
  it("narrows the plan to the chosen day", () => {
    const p = plan([day(1), day(2)]);
    expect(daysShown(p, 2).map((d) => d.day)).toEqual([2]);
    expect(daysShown(p, "all")).toHaveLength(2);
    expect(daysShown(null, "all")).toEqual([]);
  });
});

describe("mapLegsFor", () => {
  const withSteps = leg({ mode: "transit", steps: [{ mode: "walk", polyline: [[0, 0], [0, 1]] }, { mode: "bus", polyline: [[0, 1], [0, 2]] }] });
  it("splits a journey into its parts when all have lines, and keeps it whole otherwise", () => {
    expect(mapLegsFor(planDays([day(1, { legs: [withSteps] })]), 1, null).map((l) => l.mode)).toEqual(["walk", "bus"]);
    const partial = leg({ mode: "transit", steps: [{ mode: "walk" }, { mode: "bus", polyline: [[0, 1], [0, 2]] }] });
    expect(mapLegsFor(planDays([day(1, { legs: [partial] })]), 1, null).map((l) => l.mode)).toEqual(["transit"]);
  });
  it("dims every hop but the hovered one, only when a single day is shown", () => {
    const days = planDays([day(1, { legs: [leg(), leg()] })]);
    expect(mapLegsFor(days, 1, 0).map((l) => l.dim)).toEqual([false, true]);
    expect(mapLegsFor(days, "all", 0).map((l) => l.dim)).toEqual([false, false]);
    expect(mapLegsFor(days, 1, null).map((l) => l.dim)).toEqual([false, false]);
  });
});

describe("dayOverlayFor", () => {
  it("labels the hovered hop with its time", () => {
    const days = planDays([day(1, { legs: [leg({ minutes: 25 })] })]);
    expect(dayOverlayFor(days, 0, 1, (m) => `${m}m`).pills).toEqual([{ id: "hover", polyline: [[0, 0], [1, 1]], text: "25m", tone: "main" }]);
    expect(dayOverlayFor(days, null, 1, (m) => `${m}m`).pills).toEqual([]);
    expect(dayOverlayFor(days, 0, "all", (m) => `${m}m`).pills).toEqual([]);
  });
  it("gives no pill to a hop with no minutes or no line", () => {
    expect(dayOverlayFor(planDays([day(1, { legs: [leg({ minutes: null })] })]), 0, 1, String).pills).toEqual([]);
    expect(dayOverlayFor(planDays([day(1, { legs: [leg({ polyline: [[0, 0]] })] })]), 0, 1, String).pills).toEqual([]);
  });
});

describe("modesDrawn", () => {
  it("lists what the day's lines use, once each; hops with no line do not count", () => {
    const days = planDays([day(1, { legs: [leg({ mode: "walk" }), leg({ mode: "transit", steps: [{ mode: "bus" }, { mode: "walk" }] }), leg({ mode: "drive", polyline: [] })] })]);
    expect(modesDrawn("trip", days, null)).toEqual(["walk", "bus"]);
  });
  it("lists what the Browse route uses", () => {
    expect(modesDrawn("browse", [], [{ mode: "train" }, { mode: "train" }, { mode: "walk" }])).toEqual(["train", "walk"]);
    expect(modesDrawn("browse", [], null)).toEqual([]);
  });
});
