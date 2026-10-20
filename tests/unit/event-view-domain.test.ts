import { describe, expect, it } from "vitest";
import { goodToKnowRows, lineupNoteFor, readableDate, tidyAbout, venueMapsUrl } from "../../features/events/domain/event-view";
import type { EventDetail } from "../../packages/contracts/event";

const ev = (over: Partial<EventDetail> = {}) => ({ performers: [], lineupNote: null, doorsTime: null, showTime: null, admission: null, ageInfo: null, promoter: null, status: null, latitude: null, longitude: null, venueAddress: null, city: null, ...over }) as EventDetail;

describe("readableDate", () => {
  it("splits a date and time into a day and a time", () => {
    const r = readableDate("2026-12-02 20:30")!;
    expect(r.day).toMatch(/Wed.*December 2/);
    expect(r.time).toMatch(/8:30/);
  });
  it("gives a day alone for a date alone, and a loose string back as it is", () => {
    expect(readableDate("2026-12-02")!.time).toBeNull();
    expect(readableDate("Next Friday")).toEqual({ day: "Next Friday", time: null });
    expect(readableDate(null)).toBeNull();
  });
  it("accepts a T between date and time", () => {
    expect(readableDate("2026-12-02T09:05")!.time).toMatch(/9:05/);
  });
});

describe("tidyAbout", () => {
  it("drops heading marks and a 'Title:' prefix, trims line ends and collapses blank runs", () => {
    expect(tidyAbout("## Heading  \nTitle: Real\n\n\n\nBody")).toBe("Heading\nReal\n\nBody");
  });
  it("is empty for nothing", () => {
    expect(tidyAbout(null)).toBe("");
    expect(tidyAbout("  \n ")).toBe("");
  });
});

describe("lineupNoteFor", () => {
  it("keeps a note that adds something", () => {
    expect(lineupNoteFor(ev({ performers: ["A"], lineupNote: "Plus guests" }))).toBe("Plus guests");
    expect(lineupNoteFor(ev({ performers: [], lineupNote: "Plus guests" }))).toBe("Plus guests");
  });
  it("drops one that only repeats the acts", () => {
    expect(lineupNoteFor(ev({ performers: ["A", "B"], lineupNote: "a and b" }))).toBeNull();
    expect(lineupNoteFor(ev({ lineupNote: null }))).toBeNull();
    expect(lineupNoteFor(null)).toBeNull();
  });
});

describe("goodToKnowRows", () => {
  it("lists what is known, in order", () => {
    expect(goodToKnowRows(ev({ doorsTime: "19:00", showTime: "20:00", admission: "Seated", ageInfo: "18+", promoter: "P", status: "onsale" }))).toEqual([
      ["Doors", "7:00 PM"], ["Show", "8:00 PM"], ["Admission", "Seated"], ["Age", "18+"], ["Promoter", "P"], ["Status", "onsale"],
    ]);
  });
  it("is empty for nothing", () => {
    expect(goodToKnowRows(ev())).toEqual([]);
    expect(goodToKnowRows(null)).toEqual([]);
  });
});

describe("venueMapsUrl", () => {
  it("uses coordinates, else the venue's name and address (or city)", () => {
    expect(venueMapsUrl(ev({ latitude: 40.7, longitude: -74 }), "V")).toBe("https://www.google.com/maps/search/?api=1&query=40.7,-74");
    expect(venueMapsUrl(ev({ venueAddress: "1 St" }), "Blue Note")).toBe("https://www.google.com/maps/search/?api=1&query=Blue%20Note%201%20St");
    expect(venueMapsUrl(ev({ city: "NYC" }), "Blue Note")).toBe("https://www.google.com/maps/search/?api=1&query=Blue%20Note%20NYC");
    expect(venueMapsUrl(null, "Blue Note")).toBe("https://www.google.com/maps/search/?api=1&query=Blue%20Note");
  });
  it("has none without a place", () => {
    expect(venueMapsUrl(ev(), null)).toBeNull();
    expect(venueMapsUrl(null, null)).toBeNull();
  });
});
