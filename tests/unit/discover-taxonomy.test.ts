import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_BY_KEY, categoryForQuery, coarseKind } from "../../features/places/ui/discoverTaxonomy";

describe("discover taxonomy", () => {
  it("every category has a unique key and at least one sub-chip", () => {
    const keys = CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of CATEGORIES) {
      expect(c.subs.length).toBeGreaterThan(0);
      expect(CATEGORY_BY_KEY.get(c.key)).toBe(c);
    }
  });

  it("maps a free-text query to the right Tier-1 category", () => {
    expect(categoryForQuery("cheap restaurant")).toBe("eat");
    expect(categoryForQuery("techno club")).toBe("nightlife");
    expect(categoryForQuery("golden temple")).toBe("sights");
    expect(categoryForQuery("mountain hike")).toBe("outdoors");
    expect(categoryForQuery("white water rafting")).toBe("activities");
    expect(categoryForQuery("jazz festival")).toBe("events");
    expect(categoryForQuery("night market")).toBe("shopping");
    expect(categoryForQuery("boutique hotel")).toBe("stays");
    expect(categoryForQuery("something vague")).toBeNull();
  });

  it("gives a one-word badge for a Google primary type", () => {
    expect(coarseKind("hindu_temple")).toBe("Sight");
    expect(coarseKind("vegan_restaurant")).toBe("Eat");
    expect(coarseKind("national_park")).toBe("Nature");
    expect(coarseKind("night_club")).toBe("Nightlife");
    expect(coarseKind(null)).toBe("Place");
  });
});
