import { describe, expect, it } from "vitest";
import { extractEventDayIndex, extractEventTime } from "@/lib/application/event-schedule";

describe("extractEventTime", () => {
  it("reads the time embedded in a Ticketmaster-style date", () => {
    expect(extractEventTime("2026-11-14 20:00")).toBe("20:00");
    expect(extractEventTime("2026-11-14T20:00:00")).toBe("20:00");
  });

  it("falls back to showTime when the date has no time component", () => {
    expect(extractEventTime("2026-11-14", "8:00 PM")).toBe("20:00");
  });

  it("returns undefined when neither source has a usable time", () => {
    expect(extractEventTime("2026-11-14")).toBeUndefined();
    expect(extractEventTime(null)).toBeUndefined();
    expect(extractEventTime(undefined, "Doors open")).toBeUndefined();
  });
});

describe("extractEventDayIndex", () => {
  it("computes which trip day the event falls on", () => {
    expect(extractEventDayIndex("2026-11-16 20:00", "2026-11-14")).toBe(3);
  });

  it("returns undefined without a trip start date or a parseable event date", () => {
    expect(extractEventDayIndex("2026-11-16 20:00", undefined)).toBeUndefined();
    expect(extractEventDayIndex("not a date", "2026-11-14")).toBeUndefined();
    expect(extractEventDayIndex(null, "2026-11-14")).toBeUndefined();
  });

  it("returns undefined when the event falls before the trip starts", () => {
    expect(extractEventDayIndex("2026-11-10 20:00", "2026-11-14")).toBeUndefined();
  });
});
