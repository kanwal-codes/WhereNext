import { describe, expect, it } from "vitest";
import { activeFilterCount, directivePatch, initialAdults, nightsBetween, nightsText, overlappingStay, statusFor, stayCompareEntry, stayQueryString, toggled, type StayQuery } from "../../features/stays/domain/stay-search";
import type { StayOption } from "../../packages/contracts/stay";

const q = (over: Partial<StayQuery> = {}): StayQuery => ({ adults: 2, rooms: 1, sort: "price", near: "", city: "", checkin: "", checkout: "", stars: [], boards: [], propertyTypes: [], refundable: false, priceMax: null, ...over });

describe("initialAdults", () => {
  it("is the trip's party, from one to 24", () => {
    expect(initialAdults(4)).toBe(4);
    expect(initialAdults(0)).toBe(1);
    expect(initialAdults(99)).toBe(24);
    expect(initialAdults(null)).toBe(2);
  });
});

describe("nights", () => {
  it("counts nights between two days, and none without both", () => {
    expect(nightsBetween("2026-12-01", "2026-12-05")).toBe(4);
    expect(nightsBetween("2026-12-01", "")).toBe(0);
    expect(nightsBetween("2026-12-05", "2026-12-01")).toBe(-4);
  });
  it("words them", () => {
    expect(nightsText(1)).toBe("1 night");
    expect(nightsText(4)).toBe("4 nights");
    expect(nightsText(0)).toBe("");
    expect(nightsText(-2)).toBe("");
  });
});

describe("stayQueryString", () => {
  it("always carries the party and sort", () => {
    expect(stayQueryString(q())).toBe("adults=2&rooms=1&sort=price");
  });
  it("carries every choice that is made", () => {
    const qs = new URLSearchParams(stayQueryString(q({ checkin: "a", checkout: "b", stars: [4, 5], boards: ["Breakfast"], propertyTypes: ["Villa"], refundable: true, priceMax: 250, city: "Lyon" })));
    expect(Object.fromEntries(qs)).toEqual({ adults: "2", rooms: "1", sort: "price", location: "Lyon", checkin: "a", checkout: "b", stars: "4,5", boards: "Breakfast", propertyTypes: "Villa", refundable: "1", priceMax: "250" });
  });
  it("searches near a named place before the city, trimmed", () => {
    expect(new URLSearchParams(stayQueryString(q({ near: "  Part-Dieu ", city: "Lyon" }))).get("location")).toBe("Part-Dieu");
    expect(new URLSearchParams(stayQueryString(q({ near: "   ", city: "Lyon" }))).get("location")).toBe("Lyon");
  });
});

describe("statusFor", () => {
  it("is empty when there is something to show", () => {
    expect(statusFor({ options: [{}] as never })).toBe("");
    expect(statusFor({ options: [] })).toContain("Nothing matched");
  });
});

describe("directivePatch", () => {
  it("passes on only what Roam understood", () => {
    expect(directivePatch({})).toEqual({});
    expect(directivePatch({ location: "Gare", priceMax: 200, stars: [4], boards: ["B"], propertyTypes: ["V"], refundable: false, sort: "stars" } as never)).toEqual({ near: "Gare", priceMax: 200, stars: [4], boards: ["B"], propertyTypes: ["V"], refundable: false, sort: "stars" });
  });
  it("ignores empty lists, and keeps party size in range", () => {
    expect(directivePatch({ stars: [], boards: [] } as never)).toEqual({});
    expect(directivePatch({ adults: 99, rooms: 99 } as never)).toEqual({ adults: 16, rooms: 8 });
    expect(directivePatch({ adults: 3, rooms: 2 } as never)).toEqual({ adults: 3, rooms: 2 });
  });
});

describe("toggled and activeFilterCount", () => {
  it("adds or removes", () => {
    expect(toggled([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggled([1, 2], 2)).toEqual([1]);
  });
  it("counts each star, board and type, free cancellation and a price cap", () => {
    expect(activeFilterCount(q())).toBe(0);
    expect(activeFilterCount(q({ stars: [3, 4], boards: ["B"], propertyTypes: ["V"], refundable: true, priceMax: 100 }))).toBe(6);
  });
});

describe("overlappingStay", () => {
  const stay = (date: string, endDate: string | null, status: string | null = "confirmed") => ({ date, endDate, status });
  it("finds a stay that covers some of the nights", () => {
    expect(overlappingStay([stay("2026-12-02", "2026-12-04")], "2026-12-01", "2026-12-05")).toBeTruthy();
    expect(overlappingStay([stay("2026-11-30", "2026-12-02")], "2026-12-01", "2026-12-05")).toBeTruthy();
  });
  it("lets a stay end on the day these nights start, or begin on the day they end", () => {
    expect(overlappingStay([stay("2026-11-28", "2026-12-01")], "2026-12-01", "2026-12-05")).toBeUndefined();
    expect(overlappingStay([stay("2026-12-05", "2026-12-08")], "2026-12-01", "2026-12-05")).toBeUndefined();
  });
  it("skips cancelled stays, and says nothing without dates", () => {
    expect(overlappingStay([stay("2026-12-02", "2026-12-04", "cancelled")], "2026-12-01", "2026-12-05")).toBeUndefined();
    expect(overlappingStay([stay("2026-12-02", "2026-12-04")], "", "")).toBeUndefined();
  });
  it("treats a stay with no end as one night", () => {
    expect(overlappingStay([stay("2026-12-02", null)], "2026-12-01", "2026-12-05")).toBeTruthy();
    expect(overlappingStay([stay("2026-12-05", null)], "2026-12-01", "2026-12-05")).toBeUndefined();
  });
});

describe("stayCompareEntry", () => {
  const hotel = (over: Partial<StayOption> = {}) => ({ hotelId: "h", name: "Hotel", latitude: 1, longitude: 2, stars: 4, rating: 8.64, boardName: "Breakfast", refundable: true, nightlyAmount: 200, ...over }) as StayOption;
  it("describes the hotel for the panel", () => {
    expect(stayCompareEntry(hotel(), "/x", (n) => `$${n}`)).toEqual({
      id: "h", kind: "stay", name: "Hotel", href: "/x", subtitle: "4★ · Breakfast",
      attrs: { price: "$200/night", priceValue: 200, rating: "8.6/10", ratingValue: 8.64, lat: 1, lng: 2, detail: "4-star, Breakfast, free cancellation" },
    });
  });
  it("leaves out what is not known", () => {
    const e = stayCompareEntry(hotel({ stars: null, rating: 0, boardName: null, refundable: false, latitude: null, longitude: null }), "/x", String);
    expect(e.subtitle).toBeUndefined();
    expect(e.attrs).toMatchObject({ rating: undefined, ratingValue: undefined, lat: undefined, lng: undefined, detail: "Hotel" });
  });
});
