import { describe, expect, it } from "vitest";
import { panelSubjectKey, panelTitle, type PanelState } from "../../components/TripPanelProvider";
import { itineraryTitle } from "../../features/conversation/application/addPlanToItinerary";

const flight = { airline: "Air Canada", price: "212", currency: "CAD", durationMinutes: 78, stops: 0, departAt: "2026-11-26T18:05:00", arriveAt: "2026-11-26T19:23:00", originAirport: "YYZ", destinationAirport: "YUL" };
const route = { origin: "Toronto", destination: "Montreal", retrievedAt: "t" };
const itinerary = { type: "itinerary" as const, title: "2 days in Montreal", days: [{ label: "Day 1", stops: [{ title: "Mount Royal" }] }, { label: "Day 2", stops: [{ title: "Jean-Talon" }] }] };

describe("card panels", () => {
  it("names each kind for the header and for Roam's view context", () => {
    expect(panelTitle({ kind: "flight", flight, route })).toBe("Air Canada · YYZ–YUL");
    expect(panelTitle({ kind: "day", block: itinerary, dayIndex: 1 })).toBe("Day 2 · 2 days in Montreal");
    expect(panelTitle({ kind: "budget", block: { type: "budget", currency: "CAD", perPerson: true, summary: "s", lines: [], dailyTotal: { low: 1, typical: 2, high: 3 } } as never })).toBe("Daily budget");
  });

  it("gives different subjects different keys, so switching flights or days swaps the panel", () => {
    const a: PanelState = { kind: "flight", flight, route };
    const b: PanelState = { kind: "flight", flight: { ...flight, departAt: "2026-11-27T08:00:00" }, route };
    expect(panelSubjectKey(a)).not.toBe(panelSubjectKey(b));
    expect(panelSubjectKey({ kind: "day", block: itinerary, dayIndex: 0 })).not.toBe(panelSubjectKey({ kind: "day", block: itinerary, dayIndex: 1 }));
  });

  it("corrects a plan title's day count to the days actually shown", () => {
    expect(itineraryTitle("7 days in Montreal", 2)).toBe("2 days in Montreal");
    expect(itineraryTitle(undefined, 2)).toBeUndefined();
  });
});
