import { describe, expect, it } from "vitest";
import { chatItems, distanceLabel, fullPageHref } from "../../components/tripPanelLogic";
import type { CompareEntry, PanelState } from "../../components/TripPanelProvider";

const T = "trip1";
const entry = (attrs: CompareEntry["attrs"]): CompareEntry => ({ id: "e", kind: "place", name: "E", attrs });
const panel = (p: unknown) => p as PanelState;

describe("distanceLabel", () => {
  const anchor = { name: "Hotel", lat: 48.85, lng: 2.35 };
  it("is a dash without an anchor or a location", () => {
    expect(distanceLabel(entry({ lat: 1, lng: 1 }), null)).toBe("—");
    expect(distanceLabel(entry({}), anchor)).toBe("—");
  });
  it("is metres under a kilometre and kilometres beyond", () => {
    expect(distanceLabel(entry({ lat: 48.854, lng: 2.35 }), anchor)).toMatch(/^4\d\d m$/);
    expect(distanceLabel(entry({ lat: 48.9, lng: 2.35 }), anchor)).toMatch(/^5\.\d km$/);
  });
});

describe("fullPageHref", () => {
  it("maps each panel to the page that shows more of it", () => {
    expect(fullPageHref(panel({ kind: "place", placeId: "a b" }), T, [])).toBe("/trips/trip1/place/a%20b");
    expect(fullPageHref(panel({ kind: "stay", hotelId: "h", checkin: "2026-01-01" }), T, [])).toBe("/trips/trip1/stay/h?checkin=2026-01-01");
    expect(fullPageHref(panel({ kind: "stay", hotelId: "h" }), T, [])).toBe("/trips/trip1/stay/h");
    expect(fullPageHref(panel({ kind: "event", seed: { name: "J", url: "u", source: "s" } }), T, [])).toBe("/trips/trip1/event?name=J&url=u&source=s");
    for (const [kind, path] of [["collection", "discover"], ["area", "discover"], ["flight", "transport"], ["day", "itinerary"], ["budget", "budget"], ["map", "map"], ["route", "map"], ["checklist", "bookings"]] as const) {
      expect(fullPageHref(panel({ kind }), T, [])).toBe(`/trips/trip1/${path}`);
    }
    expect(fullPageHref(panel({ kind: "weather" }), T, [])).toBe("/trips/trip1");
  });
  it("compares by id, or opens the bare compare page", () => {
    expect(fullPageHref(panel({ kind: "compare" }), T, ["a", "b/c"])).toBe("/trips/trip1/compare?ids=a,b%2Fc");
    expect(fullPageHref(panel({ kind: "compare" }), T, [])).toBe("/trips/trip1/compare");
  });
});

describe("chatItems", () => {
  it("describes the compared cards", () => {
    const list = [{ id: "a", kind: "place", name: "A", attrs: { price: "€1", detail: "Cafe" } }] as CompareEntry[];
    expect(chatItems(panel({ kind: "compare" }), list)).toEqual([{ name: "A", detail: "Cafe", price: "€1", rating: undefined, when: undefined, address: undefined, lat: undefined, lng: undefined }]);
  });
  it("has nothing to say about a list of results", () => {
    expect(chatItems(panel({ kind: "collection" }), [])).toEqual([]);
  });
  it("names the single thing on screen", () => {
    expect(chatItems(panel({ kind: "stay", name: "Hotel" }), [])).toEqual([{ name: "Hotel", detail: "Hotel" }]);
    expect(chatItems(panel({ kind: "place", name: "Louvre" }), [])).toEqual([{ name: "Louvre", detail: "Place" }]);
  });
});
