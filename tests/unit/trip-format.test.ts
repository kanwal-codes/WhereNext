import { describe, expect, it } from "vitest";
import { formatDuration } from "../../lib/utils";
import { tripWhen } from "../../lib/trip-dates";

describe("formatDuration", () => {
  it("keeps sub-hour times in minutes", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(59.6)).toBe("1 h"); // rounds to 60
  });
  it("splits hours and minutes", () => {
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(80)).toBe("1 h 20 min");
    expect(formatDuration(300)).toBe("5 h");
    expect(formatDuration(305)).toBe("5 h 5 min");
  });
});

describe("tripWhen", () => {
  it("shows the date range with a day count in brackets", () => {
    expect(tripWhen("2026-03-14", "2026-03-20")).toBe("Mar 14 – Mar 20 (7 days)");
  });
  it("falls back to a length when only a duration is known", () => {
    expect(tripWhen(null, null, 5)).toBe("5 days");
    expect(tripWhen(undefined, undefined, 1)).toBe("1 day");
  });
  it("uses the empty label when nothing is known", () => {
    expect(tripWhen(null, null, null)).toBe("Not set");
    expect(tripWhen(null, null, null, "Open")).toBe("Open");
  });
});
