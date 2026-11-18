import { describe, expect, it } from "vitest";
import { clockToMinutes, formatClockTime, isClockTime, parseClockTime } from "@/lib/application/clock-time";

describe("parseClockTime", () => {
  it("reads a bare 1-6 o'clock with no am/pm as the afternoon, and leaves an explicit 24-hour time alone", () => {
    expect(parseClockTime("3:00")).toBe("15:00");
    expect(parseClockTime("3")).toBe("15:00");
    expect(parseClockTime("6:30")).toBe("18:30");
    expect(parseClockTime("7:00")).toBe("07:00");
    expect(parseClockTime("11:15")).toBe("11:15");
    expect(parseClockTime("03:00")).toBe("03:00");
    expect(parseClockTime("3:00 AM")).toBe("03:00");
  });

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

import { aDuration } from "@/lib/utils";

describe("aDuration", () => {
  it("picks a or an for how the duration is spoken", () => {
    expect(aDuration(8)).toBe("an 8 min");
    expect(aDuration(11)).toBe("an 11 min");
    expect(aDuration(18)).toBe("an 18 min");
    expect(aDuration(20)).toBe("a 20 min");
    expect(aDuration(6)).toBe("a 6 min");
    expect(aDuration(65)).toBe("a 1 h 5 min");
    expect(aDuration(480)).toBe("an 8 h");
  });
});
