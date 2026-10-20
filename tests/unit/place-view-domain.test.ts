import { describe, expect, it } from "vitest";
import { openNowChip, placeDirectionsUrl, splitHoursLine, telHref, todayHoursOf, todayIndex, usableReviews, wheelchairAccessible } from "../../features/places/domain/place-view";

const WEEK = ["Monday: 9 AM – 6 PM", "Tuesday: Closed", "Wednesday: 9 AM – 9:45 PM", "Thursday: x", "Friday: x", "Saturday: x", "Sunday: 10 AM – 4 PM"];

describe("todayIndex / todayHoursOf", () => {
  it("counts from Monday", () => {
    expect(todayIndex(new Date("2026-11-30T12:00:00"))).toBe(0); // Monday
    expect(todayIndex(new Date("2026-12-02T12:00:00"))).toBe(2); // Wednesday
    expect(todayIndex(new Date("2026-12-06T12:00:00"))).toBe(6); // Sunday
  });
  it("gives today's hours without the weekday", () => {
    expect(todayHoursOf(WEEK, new Date("2026-12-02T12:00:00"))).toBe("9 AM – 9:45 PM");
    expect(todayHoursOf(WEEK, new Date("2026-12-06T12:00:00"))).toBe("10 AM – 4 PM");
  });
  it("falls back to the first line for a short list, and null for none", () => {
    expect(todayHoursOf(["Monday: 9 AM – 5 PM"], new Date("2026-12-04T12:00:00"))).toBe("9 AM – 5 PM");
    expect(todayHoursOf([])).toBeNull();
  });
});

describe("splitHoursLine", () => {
  it("splits on the first colon-space only", () => {
    expect(splitHoursLine("Monday: 9:00 AM – 6:00 PM")).toEqual(["Monday", "9:00 AM – 6:00 PM"]);
    expect(splitHoursLine("Closed")).toEqual(["Closed", ""]);
  });
});

describe("wheelchairAccessible", () => {
  it("is true for any one provision", () => {
    expect(wheelchairAccessible({ wheelchairAccessibleRestroom: true })).toBe(true);
    expect(wheelchairAccessible({ wheelchairAccessibleEntrance: false })).toBe(false);
    expect(wheelchairAccessible(undefined)).toBe(false);
  });
});

describe("usableReviews", () => {
  it("keeps reviews with text, at most four", () => {
    const r = (text: string, original?: string) => ({ text: { text }, originalText: original ? { text: original } : undefined });
    const out = usableReviews([r(""), r("a"), r("", "b"), r("c"), r("d"), r("e"), r("f")]);
    expect(out).toHaveLength(4);
    expect(out[1].originalText?.text).toBe("b");
    expect(usableReviews(undefined)).toEqual([]);
  });
});

describe("links", () => {
  it("builds directions to the place", () => {
    expect(placeDirectionsUrl("Louvre", "Rue de Rivoli", "p 1")).toBe("https://www.google.com/maps/dir/?api=1&destination=Louvre%2C%20Rue%20de%20Rivoli&destination_place_id=p%201");
    expect(placeDirectionsUrl("Louvre", undefined, "p1")).toContain("destination=Louvre&");
  });
  it("makes a tel: link without spaces", () => {
    expect(telHref("01 40 20 53 17")).toBe("tel:0140205317");
  });
});

describe("openNowChip", () => {
  it("says open until the closing time, open now, or closed", () => {
    expect(openNowChip(true, "9 AM – 9:45 PM")).toBe("Open until 9:45 PM");
    expect(openNowChip(true, "Open 24 hours")).toBe("Open now");
    expect(openNowChip(true, null)).toBe("Open now");
    expect(openNowChip(false, "x")).toBe("Closed now");
  });
  it("says nothing when it is not known", () => {
    expect(openNowChip(undefined, "9 AM – 5 PM")).toBeNull();
  });
});
