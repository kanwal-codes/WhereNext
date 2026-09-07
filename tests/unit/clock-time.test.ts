import { describe, expect, it } from "vitest";
import { clockToMinutes, formatClockTime, isClockTime, parseClockTime } from "@/lib/application/clock-time";

describe("parseClockTime", () => {
  it("passes through an already-24h HH:MM value", () => {
    expect(parseClockTime("14:30")).toBe("14:30");
    expect(parseClockTime("09:00")).toBe("09:00");
  });

  it("converts common 12h formats", () => {
    expect(parseClockTime("9:00 AM")).toBe("09:00");
    expect(parseClockTime("9am")).toBe("09:00");
    expect(parseClockTime("2:30 PM")).toBe("14:30");
    expect(parseClockTime("12:00 PM")).toBe("12:00");
    expect(parseClockTime("12:00 AM")).toBe("00:00");
  });

  it("returns undefined for a vague period label or missing value", () => {
    expect(parseClockTime("Morning")).toBeUndefined();
    expect(parseClockTime("Afternoon")).toBeUndefined();
    expect(parseClockTime(undefined)).toBeUndefined();
    expect(parseClockTime("")).toBeUndefined();
    expect(parseClockTime("25:00")).toBeUndefined();
  });
});

describe("formatClockTime", () => {
  it("renders 24h HH:MM as a friendly 12h time", () => {
    expect(formatClockTime("09:00")).toBe("9:00 AM");
    expect(formatClockTime("14:30")).toBe("2:30 PM");
    expect(formatClockTime("00:00")).toBe("12:00 AM");
    expect(formatClockTime("12:00")).toBe("12:00 PM");
  });

  it("returns the input unchanged if it isn't a valid clock time", () => {
    expect(formatClockTime("not a time")).toBe("not a time");
  });
});

describe("clockToMinutes", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(clockToMinutes("00:00")).toBe(0);
    expect(clockToMinutes("09:30")).toBe(570);
    expect(clockToMinutes("23:59")).toBe(1439);
  });
});

describe("isClockTime", () => {
  it("validates strictly HH:MM in 24h range", () => {
    expect(isClockTime("23:59")).toBe(true);
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("9:00")).toBe(false);
    expect(isClockTime(9)).toBe(false);
  });
});
