import { describe, expect, it } from "vitest";
import type { Place } from "@/packages/contracts/place";
import { activeEatFilters, applyEatView, availableEat, DEFAULT_EAT_VIEW } from "@/features/eat/domain/eat-view";

const p = (name: string, o: Record<string, unknown> = {}) => ({ place: { name, providerId: name, ...o } as unknown as Place });
const rows = [
  p("Joe Beef", { rating: 4.5, userRatingCount: 900, priceLevel: "PRICE_LEVEL_VERY_EXPENSIVE", openNow: true }),
  p("Schwartz’s", { rating: 4.4, userRatingCount: 12000, priceLevel: "PRICE_LEVEL_MODERATE", openNow: true }),
  p("Olive et Gourmando", { rating: 4.4, userRatingCount: 3000, priceLevel: "PRICE_LEVEL_MODERATE" }),
  p("Corner stand", { rating: 3.2 }),
];
const names = (v: object) => applyEatView(rows, { ...DEFAULT_EAT_VIEW, ...v }).map((r) => r.place.name);

describe("eat view", () => {
  it("keeps Roam’s order by default", () => {
    expect(names({})).toEqual(["Joe Beef", "Schwartz’s", "Olive et Gourmando", "Corner stand"]);
  });
  it("sorts by rating (ties by how many rated it) and by lowest price (unpriced last)", () => {
    expect(names({ sort: "rating" })).toEqual(["Joe Beef", "Schwartz’s", "Olive et Gourmando", "Corner stand"]);
    expect(names({ sort: "price" })).toEqual(["Schwartz’s", "Olive et Gourmando", "Joe Beef", "Corner stand"]);
  });
  it("filters by open now, price and rating", () => {
    expect(names({ openNow: true })).toEqual(["Joe Beef", "Schwartz’s"]);
    expect(names({ prices: [2] })).toEqual(["Schwartz’s", "Olive et Gourmando"]);
    expect(names({ minRating: 4.5 })).toEqual(["Joe Beef"]);
  });
  it("counts the filters on, not the sort", () => {
    expect(activeEatFilters({ ...DEFAULT_EAT_VIEW, sort: "rating" })).toBe(0);
    expect(activeEatFilters({ sort: "pick", openNow: true, prices: [2, 4], minRating: 4 })).toBe(4);
  });
  it("offers only filters that would change the list", () => {
    expect(availableEat(rows)).toEqual({ prices: [2, 4], openNow: true, ratings: true });
    expect(availableEat([rows[0]])).toEqual({ prices: [], openNow: false, ratings: false });
  });
});
