import { describe, expect, it } from "vitest";
import {
  appendEvents, asList, digestBands, directiveAction, flatFeed, idOf, interestsKeyOf, interestTerms, isTourOperator, num, rankContext, scopeQuery,
  searchResults, staysInBands, starBand, toStayItem, type Item,
} from "../../features/places/domain/discover";

const place = (id: string, name: string, over: Record<string, unknown> = {}) => ({ provider: "g", providerId: id, name, address: "Rue 1, Paris, France", category: "restaurant", ...over }) as never;
const ev = (url: string, date?: string) => ({ title: url, url, date, source: "tm" });
const stayItem = (id: string, stars: number | null) => ({ hotelId: id, name: id, thumbnail: null, nightlyAmount: 1, currency: "EUR", stars, rating: null });

describe("small helpers", () => {
  it("reads a list from an array or a comma-separated string", () => {
    expect(asList(["a", 1, "b"])).toEqual(["a", "b"]);
    expect(asList("a, b ,,c")).toEqual(["a", "b", "c"]);
    expect(asList(undefined)).toEqual([]);
  });
  it("accepts only a finite non-zero number", () => {
    expect([num(3), num(0), num(NaN), num("3"), num(Infinity)]).toEqual([3, null, null, null, null]);
  });
  it("tells tour operators from landmarks that merely mention tours", () => {
    expect(isTourOperator(place("1", "Paris Walks", { category: "tour_agency" }))).toBe(true);
    expect(isTourOperator(place("2", "Seine Cruises", { category: "travel_agency" }))).toBe(true);
    expect(isTourOperator(place("3", "Food Tours Paris", { category: "restaurant" }))).toBe(true);
    expect(isTourOperator(place("4", "Notre-Dame", { category: "church" }))).toBe(false);
    expect(isTourOperator(place("5", "Detour Cafe", { category: "cafe" }))).toBe(false);
  });
  it("identifies a place by id, an event by url and date, a stay by hotel id", () => {
    expect(idOf({ kind: "place", place: place("p", "x") })).toBe("p");
    expect(idOf({ kind: "event", event: ev("u", "2026-01-01") })).toBe("u|2026-01-01");
    expect(idOf({ kind: "event", event: ev("u") })).toBe("u|");
    expect(idOf({ kind: "stay", stay: stayItem("h", 4) })).toBe("h");
  });
  it("bands stars 1–4, with unrated as 0", () => {
    expect([null, 0, 1, 2.9, 3, 4, 5].map(starBand)).toEqual([0, 0, 1, 1, 2, 3, 4]);
  });
  it("normalises a stay from a loose provider record", () => {
    expect(toStayItem({ hotelId: 7, name: "Inn", thumbnail: "t.jpg", nightlyAmount: "120", currency: "EUR", stars: 4, rating: "9" })).toEqual({
      hotelId: "7", name: "Inn", thumbnail: "t.jpg", nightlyAmount: 120, currency: "EUR", stars: 4, rating: null,
    });
    expect(toStayItem({})).toMatchObject({ hotelId: "", name: "Stay", thumbnail: null, nightlyAmount: 0, stars: null });
  });
});

describe("scopeQuery", () => {
  it("adds the destination to a query that does not name a place", () => {
    expect(scopeQuery("rooftop bars", "Paris, France")).toBe("rooftop bars in Paris, France");
  });
  it("leaves a query alone that already has a comma or names the city", () => {
    expect(scopeQuery("bars, Lyon", "Paris, France")).toBe("bars, Lyon");
    expect(scopeQuery("bars in paris", "Paris, France")).toBe("bars in paris");
  });
  it("leaves it alone when the trip has no destination", () => {
    expect(scopeQuery(" ramen ", "")).toBe("ramen");
  });
  it("force-anchors a list of interests, whose commas are not a place name", () => {
    expect(scopeQuery("food, art, jazz", "Paris, France")).toBe("food, art, jazz");
    expect(scopeQuery("food, art, jazz", "Paris, France", { force: true })).toBe("food, art, jazz in Paris, France");
    expect(scopeQuery("art in Paris", "Paris, France", { force: true })).toBe("art in Paris");
  });
});

describe("interestTerms and rankContext", () => {
  it("joins interests and likes, lower-cased, distinct, at most four", () => {
    const key = interestsKeyOf({ interests: ["Food", "Art"], likes: "Jazz, food, Museums, Beaches" });
    expect(key).toBe("food,art,jazz,food,museums,beaches");
    expect(interestTerms(key)).toEqual(["food", "art", "jazz", "museums"]);
    expect(interestsKeyOf({})).toBe("");
    expect(interestTerms("")).toEqual([]);
  });

  it("anchors on the middle of the located stops, and on a confirmed stay", () => {
    const ctx = rankContext({ prefs: { interests: ["art"], likes: ["jazz"] }, dislikesKey: "crowds", savedKey: "a,b", rejectedKey: "z", itinKey: "10,20|30,40|,", stayKey: "1.5,2.5", miles: true });
    expect(ctx).toMatchObject({ interests: ["art"], likes: ["jazz"], dislikes: ["crowds"], savedIds: ["a", "b"], rejectedIds: ["z"], miles: true, anchor: { latitude: 20, longitude: 30 }, stayAnchor: { latitude: 1.5, longitude: 2.5 } });
  });

  it("has no anchors when there are no stops or stay", () => {
    expect(rankContext({ prefs: {}, dislikesKey: "", savedKey: "", rejectedKey: "", itinKey: "", stayKey: "", miles: false })).toMatchObject({ anchor: null, stayAnchor: null, savedIds: [] });
  });
});

describe("digestBands", () => {
  const rank = (places: never[]): Item[] => (places as { providerId: string }[]).map((p) => ({ kind: "place", place: p as never }));
  const base = { sights: [place("s", "Louvre")], forYou: [place("f", "Chapelle")], eat: [place("e1", "Local"), place("e2", "Faraway", { address: "Berlin, Germany" })], tours: [place("t1", "Tours", { category: "tour_agency" }), place("t2", "Church", { category: "church" })], events: [ev("u1")], stays: Array.from({ length: 8 }, (_, i) => stayItem(`h${i}`, 4)), interests: [] as string[], destination: "Paris, France", rank: rank as never };

  it("orders the bands and filters food by destination and tours by operator", () => {
    const bands = digestBands(base);
    expect(bands.map((b) => b.label)).toEqual(["Top sights", "Highly rated right now", "Where to eat", "Tours & activities", "On while you’re there", "Places to stay"]);
    expect(bands[2].items.map(idOf)).toEqual(["e1"]);
    expect(bands[3].items.map(idOf)).toEqual(["t1"]);
    expect(bands[5].items).toHaveLength(6);
  });

  it("names the for-you band after the first two interests", () => {
    expect(digestBands({ ...base, interests: ["food", "art", "jazz"] })[1].label).toBe("Because you like food & art");
  });

  it("drops empty bands", () => {
    expect(digestBands({ ...base, sights: [], eat: [], events: [], stays: [] }).map((b) => b.label)).toEqual(["Highly rated right now", "Tours & activities"]);
  });
});

describe("feeds", () => {
  it("appends only events not already listed (same url on another date counts as new)", () => {
    const current: Item[] = [{ kind: "event", event: ev("a", "d1") }];
    const out = appendEvents(current, [ev("a", "d1"), ev("a", "d2"), ev("b")]);
    expect(out.map(idOf)).toEqual(["a|d1", "a|d2", "b|"]);
  });

  it("flattens bands to at most six each, once per thing", () => {
    const mk = (id: string): Item => ({ kind: "place", place: place(id, id) });
    const bands = [{ key: "a", label: "A", items: ["1", "2", "3", "4", "5", "6", "7"].map(mk) }, { key: "b", label: "B", items: ["3", "8"].map(mk) }];
    expect(flatFeed(bands).map(idOf)).toEqual(["1", "2", "3", "4", "5", "6", "8"]);
    expect(flatFeed(null)).toEqual([]);
  });

  it("narrows stays to the chosen star bands", () => {
    const stays = [stayItem("a", 2), stayItem("b", 4), stayItem("c", 5), stayItem("d", null)];
    const bandOf = (label: string) => ({ Mid: 2, Upscale: 3, Luxury: 4 })[label as "Mid"]!;
    expect(staysInBands(stays, [], bandOf)).toBe(stays);
    expect(staysInBands(stays, ["Upscale", "Luxury"], bandOf).map((s) => s.hotelId)).toEqual(["b", "c"]);
  });
});

describe("searchResults", () => {
  const found = [place("1", "In Paris"), place("2", "In Tokyo", { address: "Tokyo, Japan" })];
  it("keeps the places in the destination when the search was anchored", () => {
    expect(searchResults(found, true, "Paris, France").map((p) => p.name)).toEqual(["In Paris"]);
  });
  it("shows everything when nothing is in the destination, or the search was not anchored", () => {
    expect(searchResults([found[1]], true, "Paris, France")).toHaveLength(1);
    expect(searchResults(found, false, "Paris, France")).toHaveLength(2);
  });
});

describe("directiveAction", () => {
  const known = (k: string) => ["nightlife", "outdoors"].includes(k);
  it("opens the category for a bare category ask, with its sub-chips and a friendly label", () => {
    expect(directiveAction({ categories: ["Nightlife"], subChips: ["Clubs"] } as never, "nightlife", known)).toEqual({ kind: "category", category: "nightlife", subs: ["Clubs"], label: "nightlife" });
    expect(directiveAction({ categories: ["outdoors"] } as never, "x", known)).toMatchObject({ label: "Nature & Outdoors", subs: [] });
  });
  it("runs a free-text search when the ask is specific, or the category is unknown", () => {
    expect(directiveAction({ freeText: "rooftop bars", categories: ["nightlife"] } as never, "raw", known)).toEqual({ kind: "search", query: "rooftop bars", label: "rooftop bars" });
    expect(directiveAction({ categories: ["museums"] } as never, "old art", known)).toEqual({ kind: "search", query: "old art", label: "old art" });
  });
  it("adds the area to the query and the label", () => {
    expect(directiveAction({ freeText: "rooftop bars", location: "Montmartre" } as never, "raw", known)).toEqual({ kind: "search", query: "rooftop bars near Montmartre", label: "rooftop bars · near Montmartre" });
  });
});
