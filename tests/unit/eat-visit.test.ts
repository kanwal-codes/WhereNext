import { describe, expect, it } from "vitest";
import { NO_VISIT, openAt, requestText, spansOf, visitLine, visitNote, visitSet } from "@/features/eat/domain/eat-visit";

const THIN = " ";
const hours = [
  `Monday: Closed`,
  `Tuesday: 11:00${THIN}AM${THIN}–${THIN}10:00${THIN}PM`,
  `Wednesday: 11:00${THIN}AM${THIN}–${THIN}3:00${THIN}PM, 5:00${THIN}–${THIN}10:00${THIN}PM`,
  `Thursday: Open 24 hours`,
  `Friday: 6:00${THIN}PM${THIN}–${THIN}2:00${THIN}AM`,
  `Saturday: 11:00${THIN}AM${THIN}–${THIN}10:00${THIN}PM`,
  `Sunday: 10:00${THIN}AM${THIN}–${THIN}4:00${THIN}PM`,
];
const place = { openingHours: hours };
// 2026-12-01 is a Tuesday.
const at = (date: string, time = "") => ({ ...NO_VISIT, date, time });

describe("spansOf", () => {
  it("reads closed, all-day, split days and a late close", () => {
    expect(spansOf(hours[0]!)).toEqual([]);
    expect(spansOf(hours[3]!)).toEqual([[0, 1440]]);
    expect(spansOf(hours[2]!)).toEqual([[660, 900], [1020, 1320]]);
    expect(spansOf(hours[4]!)).toEqual([[1080, 1560]]);
  });
  it("gives up on a line it cannot read", () => { expect(spansOf("Tuesday: by appointment")).toBeNull(); });
});

describe("openAt", () => {
  it("is null with nothing to check against, or with no hours", () => {
    expect(openAt(place, NO_VISIT)).toBeNull();
    expect(openAt({ openingHours: undefined }, at("2026-12-01", "12:00"))).toBeNull();
  });
  it("checks the hour on the day asked", () => {
    expect(openAt(place, at("2026-12-01", "12:30"))).toBe(true);
    expect(openAt(place, at("2026-12-01", "23:00"))).toBe(false);
    expect(openAt(place, at("2026-12-02", "16:00"))).toBe(false); // the gap between lunch and dinner
    expect(openAt(place, at("2026-12-02", "19:00"))).toBe(true);
  });
  it("asks only whether the day is closed when there is no hour", () => {
    expect(openAt(place, at("2026-11-30"))).toBe(false); // Monday
    expect(openAt(place, at("2026-12-01"))).toBe(true);
  });
  it("counts a late night that began the evening before", () => {
    expect(openAt(place, at("2026-12-05", "01:00"))).toBe(true); // Saturday 1 AM, Friday's 2 AM close
    expect(openAt(place, at("2026-12-05", "03:00"))).toBe(false);
  });
});

describe("the words", () => {
  it("says only what was given", () => {
    expect(visitSet(NO_VISIT)).toBe(false);
    expect(visitLine({ guests: 4, date: "2026-12-05", time: "19:30" })).toBe("Table for 4 · Sat, Dec 5 · 7:30 PM");
    expect(visitLine({ guests: null, date: "", time: "19:30" })).toBe("7:30 PM");
    expect(requestText("Nobu", { guests: 4, date: "2026-12-05", time: "19:30" })).toBe("Hi, could I book a table for 4 on Sat, Dec 5 at 7:30 PM at Nobu?");
    expect(requestText("Nobu", NO_VISIT)).toBe("Hi, could I book a table at Nobu?");
  });
  it("warns about a closed day and about a big group, not otherwise", () => {
    expect(visitNote(place, at("2026-11-30", "19:00"))).toBe("Closed on Mondays.");
    expect(visitNote(place, at("2026-12-01", "23:00"))).toContain("Tuesday hours: 11:00 AM – 10:00 PM");
    expect(visitNote(place, { guests: 10, date: "", time: "" })).toContain("call ahead");
    expect(visitNote(place, { guests: 2, date: "2026-12-01", time: "19:00" })).toBeNull();
  });
});
