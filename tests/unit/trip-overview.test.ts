import { describe, expect, it } from "vitest";
import { budgetLabel, categoryLabel, dayLabel, hasTaste, openQuestions, placePhotoName, planDays, tastePicture } from "../../lib/trip-overview";

describe("budgetLabel", () => {
  it("formats a number as a daily amount and passes free text through", () => {
    expect(budgetLabel({ budget: 180 })).toBe("CA$180/day each");
    expect(budgetLabel({ budget: 180, currency: "eur" })).toBe("€180/day each");
    expect(budgetLabel({ budget: " mid-range " })).toBe("mid-range");
  });
  it("is null when there is no usable budget", () => {
    expect(budgetLabel({})).toBeNull();
    expect(budgetLabel({ budget: 0 })).toBeNull();
    expect(budgetLabel({ budget: "  " })).toBeNull();
  });
});

describe("tastePicture", () => {
  it("groups likes, avoids, dietary needs and single-value facts", () => {
    const taste = tastePicture({ likes: ["seafood", "viewpoints"], dislikes: ["crowds"], dietaryNeeds: ["vegetarian"], pace: "relaxed", groupType: "friends", vibe: "" });
    expect(taste.likes).toEqual(["seafood", "viewpoints"]);
    expect(taste.avoids).toEqual(["crowds"]);
    expect(taste.dietary).toEqual(["vegetarian"]);
    expect(taste.facets).toEqual([{ label: "Pace", value: "relaxed" }, { label: "Group", value: "friends" }]);
    expect(hasTaste(taste)).toBe(true);
  });
  it("ignores junk and reports nothing known for an empty record", () => {
    const taste = tastePicture({ likes: [1, null, "  ", "wine"], pace: 4 });
    expect(taste.likes).toEqual(["wine"]);
    expect(taste.facets).toEqual([]);
    expect(hasTaste(tastePicture({}))).toBe(false);
  });
});

describe("openQuestions", () => {
  it("asks only for what is missing", () => {
    expect(openQuestions({ durationDays: 5, preferences: { budget: 100, pace: "relaxed" }, savedCount: 3 })).toEqual([]);
    expect(openQuestions({ durationDays: null, preferences: {}, savedCount: 0 })).toEqual([
      "How many days is the trip?",
      "What's a rough daily budget?",
      "How packed should the days be?",
      "Nothing saved yet. Start with Discover or Roam.",
    ]);
  });
});

describe("dayLabel and planDays", () => {
  it("counts days forward from the start date without a timezone shift", () => {
    expect(dayLabel("2026-10-12", 1)).toBe(new Date("2026-10-12T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }));
    expect(dayLabel("2026-10-12", 3)).toBe(new Date("2026-10-14T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }));
    expect(dayLabel(null, 1)).toBeNull();
    expect(dayLabel("not a date", 1)).toBeNull();
  });

  it("groups by day, orders within a day by position, and keeps the first few days", () => {
    const days = planDays(
      [
        { title: "B", day_index: 2, position: 1 },
        { title: "A", day_index: 2, position: 0 },
        { title: "First", day_index: 1, position: 0 },
        { title: "Late", day_index: 5, position: 0 },
        { title: "Mid", day_index: 3, position: 0 },
        { title: "Later", day_index: 4, position: 0 },
      ],
      "2026-10-12",
      3,
    );
    expect(days.map((d) => d.day)).toEqual([1, 2, 3]);
    expect(days[1]!.items).toEqual(["A", "B"]);
    expect(days[0]!.label).toBeTruthy();
  });
});

describe("placePhotoName and categoryLabel", () => {
  it("finds the first photo of a saved place", () => {
    expect(placePhotoName({ metadata: { photoNames: ["", "places/a/photos/b"] } })).toBe("places/a/photos/b");
    expect(placePhotoName({ metadata: {} })).toBeUndefined();
    expect(placePhotoName(null)).toBeUndefined();
  });
  it("makes a category readable", () => {
    expect(categoryLabel("tourist_attraction")).toBe("Tourist attraction");
    expect(categoryLabel(null)).toBe("");
  });
});
