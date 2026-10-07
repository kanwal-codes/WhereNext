import { describe, expect, it } from "vitest";
import { formatDuration } from "@/lib/format-duration";

describe("formatDuration", () => {
  it("uses minutes under an hour", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(0.2)).toBe("1 min");
  });

  it("uses hours and minutes, dropping a zero part", () => {
    expect(formatDuration(149)).toBe("2 h 29 min");
    expect(formatDuration(180)).toBe("3 h");
    expect(formatDuration(60)).toBe("1 h");
  });

  it("uses days, hours and minutes for long journeys", () => {
    expect(formatDuration(1440 + 4 * 60 + 5)).toBe("1 d 4 h 5 min");
    expect(formatDuration(2 * 1440)).toBe("2 d");
    expect(formatDuration(1440 + 30)).toBe("1 d 30 min");
  });
});
