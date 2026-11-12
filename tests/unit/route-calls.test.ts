import { describe, expect, it } from "vitest";
import { planBreadth, routePlaceCalls } from "../../lib/application/route-calls";

const stops = ["New York", "Rome", "Paris"].map((city) => ({ city, startDate: null, endDate: null }));
const base = { wantsItinerary: true, requestedDays: null, tripDays: 20, stops, locationFocus: "New York, Rome, Paris", existing: [] as Array<{ tool: string; location?: string | null }> };

describe("routePlaceCalls", () => {
  it("searches every city for a whole-trip plan", () => {
    expect(routePlaceCalls(base).map((c) => c.location)).toEqual(["New York", "Rome", "Paris"]);
  });
  it("skips cities the plan already searches", () => {
    expect(routePlaceCalls({ ...base, existing: [{ tool: "search_places", location: "Rome, Italy" }] }).map((c) => c.location)).toEqual(["New York", "Paris"]);
  });
  it("adds nothing for one city's days, a one-city trip, or a non-plan turn", () => {
    expect(routePlaceCalls({ ...base, locationFocus: "Rome", requestedDays: 3 })).toEqual([]);
    expect(routePlaceCalls({ ...base, requestedDays: 3 })).toEqual([]);
    expect(routePlaceCalls({ ...base, stops: stops.slice(0, 1) })).toEqual([]);
    expect(routePlaceCalls({ ...base, wantsItinerary: false })).toEqual([]);
  });
  it("treats a plan for most of the trip as the whole trip, and caps the extra searches", () => {
    expect(routePlaceCalls({ ...base, requestedDays: 18 })).toHaveLength(3);
    const many = Array.from({ length: 9 }, (_, i) => ({ city: `City${i}`, startDate: null, endDate: null }));
    expect(routePlaceCalls({ ...base, stops: many, locationFocus: null })).toHaveLength(5);
  });
});

describe("planBreadth", () => {
  const search = (query: string) => ({ tool: "search_places", query });

  it("keeps a few places per day and adds a search for each kind a short plan lacks", () => {
    const out = planBreadth({ days: 5, existing: [search("Indian restaurants")], location: "Toronto" });
    expect(out.placeLimit).toBe(25);
    // The conversation's own search was food, so the rest are sights and outdoors, not a second restaurant search.
    expect(out.calls.map((c) => c.query)).toEqual(["top sights and landmarks", "parks, trails and outdoor activities"]);
    expect(out.calls.every((c) => c.location === "Toronto")).toBe(true);
  });

  it("goes wider for a week or more, and never below the usual dozen", () => {
    expect(planBreadth({ days: 10, existing: [], location: "Toronto" })).toMatchObject({ placeLimit: 50, calls: expect.any(Array) });
    expect(planBreadth({ days: 10, existing: [], location: "Toronto" }).calls).toHaveLength(6);
    expect(planBreadth({ days: 1, existing: [search("museums"), search("restaurants"), search("things to do")], location: "Toronto" })).toEqual({ placeLimit: 12, calls: [] });
  });

  const kinds = [
    { label: "Waterfalls", why: "", origin: "place" as const, placeQuery: "waterfalls and scenic trails", eventQuery: "", scale: "day_trip" as const, weight: 3, tags: [] as string[], intensity: "active" as const },
    { label: "Music", why: "", origin: "season" as const, placeQuery: "live music venues", eventQuery: "music festival", scale: "city" as const, weight: 2, tags: [] as string[], intensity: "active" as const },
    { label: "Markets", why: "", origin: "place" as const, placeQuery: "markets and street food", eventQuery: "", scale: "city" as const, weight: 2, tags: [] as string[], intensity: "active" as const },
  ];

  it("searches one place kind per brief kind, not the same kind again, and never the fixed lanes", () => {
    const out = planBreadth({ days: 3, existing: [search("markets and street food")], location: "Toronto", kinds });
    expect(out.calls.filter((c) => c.tool === "search_places").map((c) => (c as { query: string }).query)).toEqual(["waterfalls and scenic trails", "live music venues"]);
  });

  it("adds a broad events search plus one per kind that has events, but only when the trip has dates", () => {
    const withDates = planBreadth({ days: 3, existing: [], location: "Toronto", kinds, hasDates: true }).calls.filter((c) => c.tool === "events");
    expect(withDates.map((c) => (c as { category: string | null }).category)).toEqual([null, "music festival"]);
    expect(withDates.every((c) => (c as { dateScoped: boolean }).dateScoped)).toBe(true);
    expect(planBreadth({ days: 3, existing: [], location: "Toronto", kinds }).calls.some((c) => c.tool === "events")).toBe(false);
    expect(planBreadth({ days: 3, existing: [{ tool: "events" }], location: "Toronto", kinds, hasDates: true }).calls.some((c) => c.tool === "events")).toBe(false);
  });

  it("caps the place searches when a budget of searches is shared between cities", () => {
    const out = planBreadth({ days: 5, existing: [], location: "Rome", kinds, maxSearches: 2 });
    expect(out.calls.filter((c) => c.tool === "search_places")).toHaveLength(2);
  });
});
