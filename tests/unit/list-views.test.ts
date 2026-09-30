import { describe, expect, it } from "vitest";
import { applyEventView, applyStayView, DEFAULT_EVENT_VIEW, DEFAULT_STAY_VIEW, eventControls, parseDistanceM, stayControls } from "../../features/conversation/ui/blocks/listViews";

const stay = (o: Record<string, unknown>) => ({ hotelId: "h", name: "H", nightlyPrice: "100", totalPrice: "300", currency: "CAD", ...o }) as never;
const stays = [
  stay({ name: "A", nightlyPrice: "180", rating: 8.1, stars: 4, board: "Breakfast Included", refundable: true, distanceToLocked: "1.4 km from X" }),
  stay({ name: "B", nightlyPrice: "97", rating: 9.4, stars: 3, board: "Room Only", distanceToLocked: "400 m from X" }),
  stay({ name: "C", nightlyPrice: "120", stars: 5, board: "Room Only", refundable: true }),
];
const sn = (v: object) => applyStayView(stays, { ...DEFAULT_STAY_VIEW, ...v }).map((s) => s.name);

describe("stay sort and filters", () => {
  it("parses distances", () => {
    expect(parseDistanceM("400 m from the Museum")).toBe(400);
    expect(parseDistanceM("1.4 km from X")).toBe(1400);
    expect(parseDistanceM("near the station")).toBeUndefined();
  });
  it("sorts, putting stays without the value last", () => {
    expect(sn({ sort: "price" })).toEqual(["B", "C", "A"]);
    expect(sn({ sort: "rating" })).toEqual(["B", "A", "C"]);
    expect(sn({ sort: "closest" })).toEqual(["B", "A", "C"]);
  });
  it("filters by refundable, breakfast and stars", () => {
    expect(sn({ refundable: true })).toEqual(["A", "C"]);
    expect(sn({ breakfast: true })).toEqual(["A"]);
    expect(sn({ stars4: true })).toEqual(["A", "C"]);
  });
  it("offers only the controls that would change the list", () => {
    const { sorts, filters } = stayControls(stays, DEFAULT_STAY_VIEW, () => undefined);
    expect(sorts.map((s) => s.id)).toEqual(["recommended", "price", "rating", "closest"]);
    expect(filters.map((f) => f.id)).toEqual(["refundable", "breakfast", "stars4"]);
    expect(stayControls([stays[0], stays[2]], DEFAULT_STAY_VIEW, () => undefined).filters.map((f) => f.id)).toEqual(["breakfast"]);
  });
});

const ev = (o: Record<string, unknown>) => ({ title: "E", url: "https://x", source: "t", ...o }) as never;
const events = [
  ev({ title: "Late", date: "2026-10-05", venue: "Bell Centre", relToTrip: "in" }),
  ev({ title: "Early", date: "2026-10-01", venue: "Apollo", relToTrip: "before" }),
  ev({ title: "Mid", date: "2026-10-03", venue: "Apollo", relToTrip: "in" }),
];
const en = (v: object) => applyEventView(events, { ...DEFAULT_EVENT_VIEW, ...v }).map((e) => e.title);

describe("event sort and filters", () => {
  it("sorts by date and filters to the trip window or a venue", () => {
    expect(en({ sort: "soonest" })).toEqual(["Early", "Mid", "Late"]);
    expect(en({ duringTrip: true })).toEqual(["Late", "Mid"]);
    expect(en({ venue: "Apollo" })).toEqual(["Early", "Mid"]);
  });
  it("offers Soonest only when it would reorder the list", () => {
    expect(eventControls(events, DEFAULT_EVENT_VIEW, () => undefined).sorts.map((s) => s.id)).toEqual(["relevance", "soonest"]);
    expect(eventControls([events[1], events[2], events[0]], DEFAULT_EVENT_VIEW, () => undefined).sorts).toEqual([]);
  });
  it("offers a trip filter only when some events are outside it", () => {
    expect(eventControls(events, DEFAULT_EVENT_VIEW, () => undefined).filters.map((f) => f.id)).toEqual(["trip", "venue:Bell Centre", "venue:Apollo"]);
    expect(eventControls([events[0], events[2]], DEFAULT_EVENT_VIEW, () => undefined).filters.map((f) => f.id)).toEqual(["venue:Bell Centre", "venue:Apollo"]);
  });
});
