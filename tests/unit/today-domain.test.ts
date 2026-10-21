import { describe, expect, it } from "vitest";
import { dateLineFor, directionsTo, firstPlannedDay, isoDayOf, mapMarkers, minutesOf, startLineFor, stopsAhead, stopsOfDay, timeOf, untilLabel, type ItineraryRow } from "../../features/itinerary/domain/today";

const row = (id: string, day: number, position: number, meta: ItineraryRow["metadata"] = null): ItineraryRow => ({ id, title: id, day_index: day, position, metadata: meta });

describe("today: clock", () => {
  it("reads a stop's time only when it is text", () => {
    expect(timeOf(row("a", 1, 1, { time: "09:30" }))).toBe("09:30");
    expect(timeOf(row("a", 1, 1, { time: 930 }))).toBe("");
    expect(timeOf(row("a", 1, 1))).toBe("");
  });

  it("turns HH:MM into minutes, and nothing else", () => {
    expect(minutesOf("09:30")).toBe(570);
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("")).toBeNull();
    expect(minutesOf("soon")).toBeNull();
  });

  it("says how long until a stop", () => {
    expect(untilLabel(null)).toBeNull();
    expect(untilLabel(-5)).toBe("Now");
    expect(untilLabel(0)).toBe("Now");
    expect(untilLabel(1)).toBe("In 1 min");
    expect(untilLabel(59)).toBe("In 59 min");
    expect(untilLabel(60)).toBe("In 1h");
    expect(untilLabel(125)).toBe("In 2h 5m");
  });
});

describe("today: dates", () => {
  it("names the trip day's date from the start string", () => {
    expect(dateLineFor("2026-10-20", 1)).toMatch(/Tuesday, October 20/);
    expect(dateLineFor("2026-10-20", 3)).toMatch(/Thursday, October 22/);
    expect(dateLineFor("2026-10-30", 3)).toMatch(/November 1/); // across a month
  });

  it("has no date line without a real start or a day", () => {
    expect(dateLineFor(null, 1)).toBeNull();
    expect(dateLineFor("2026-10-20", null)).toBeNull();
    expect(dateLineFor("20 Oct", 1)).toBeNull();
  });

  it("names the start day for a trip that has not begun", () => {
    expect(startLineFor("2026-11-02")).toMatch(/November 2/);
    expect(startLineFor("soon")).toBeNull();
    expect(startLineFor(null)).toBeNull();
  });

  it("finds the calendar day of a trip day", () => {
    expect(isoDayOf("2026-10-20", 1)).toBe("2026-10-20");
    expect(isoDayOf("2026-10-30", 3)).toBe("2026-11-01");
    expect(isoDayOf(null, 1)).toBeNull();
    expect(isoDayOf("2026-10-20", null)).toBeNull();
  });
});

describe("today: stops", () => {
  const rows = [row("late", 1, 3, { time: "20:00" }), row("none", 1, 1), row("early", 1, 2, { time: "09:00" }), row("other", 2, 1, { time: "08:00" }), row("tie", 1, 5, { time: "09:00" })];

  it("finds the first planned day", () => {
    expect(firstPlannedDay(rows)).toBe(1);
    expect(firstPlannedDay([row("a", 4, 1), row("b", 2, 1)])).toBe(2);
    expect(firstPlannedDay([])).toBeNull();
  });

  it("orders a day by time, then plan order, with untimed stops last", () => {
    expect(stopsOfDay(rows, 1).map((r) => r.id)).toEqual(["early", "tie", "late", "none"]);
    expect(stopsOfDay(rows, 3)).toEqual([]);
  });

  it("keeps what is yet to come, what just began and what has no time", () => {
    const day = stopsOfDay(rows, 1);
    expect(stopsAhead(day, 9 * 60 + 30).map((r) => r.id)).toEqual(["early", "tie", "late", "none"]); // 09:00 began exactly half an hour ago
    expect(stopsAhead(day, 9 * 60 + 31).map((r) => r.id)).toEqual(["late", "none"]);
    expect(stopsAhead(day, 21 * 60).map((r) => r.id)).toEqual(["none"]);
  });
});

describe("today: places", () => {
  const at = (lat: unknown, lng: unknown) => row("p", 1, 1, { latitude: lat, longitude: lng });

  it("lists only stops that have a real place, longitude first", () => {
    expect(mapMarkers([at(38.7, -9.1), at(0, 0), row("n", 1, 1), at("x", 3), at(38.8, -9.2)])).toEqual(["-9.1,38.7", "-9.2,38.8"]);
  });

  it("counts a place on the equator or the prime meridian", () => {
    expect(mapMarkers([at(0, 12), at(40, 0)])).toEqual(["12,0", "0,40"]);
  });

  it("links to directions with latitude first, or to nothing", () => {
    expect(directionsTo(at(38.7, -9.1))).toBe("https://www.google.com/maps/dir/?api=1&destination=38.7,-9.1");
    expect(directionsTo(at(0, 0))).toBeNull();
    expect(directionsTo(row("n", 1, 1))).toBeNull();
    expect(directionsTo(undefined)).toBeNull();
  });
});
