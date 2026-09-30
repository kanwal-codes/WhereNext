import { describe, expect, it } from "vitest";
import { relativeDate } from "@/lib/relative-time";

const now = new Date("2026-09-30T12:00:00Z");

describe("relativeDate", () => {
  it("reads like a place review", () => {
    expect(relativeDate("2026-06-30", now)).toBe("3 months ago");
    expect(relativeDate("2026-09-16", now)).toBe("2 weeks ago");
    expect(relativeDate("2025-09-15", now)).toBe("last year");
    expect(relativeDate("2026-09-29", now)).toBe("yesterday");
  });
  it("copes with a bad date", () => {
    expect(relativeDate("soon", now)).toBe("");
  });
});
