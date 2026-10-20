import { describe, expect, it } from "vitest";
import {
  bookedLabel, byOrder, chronological, cityOfDay, dayAfterMove, dayDate, groupByDay, isoForDay, planCentre, planDays,
  reorderChange, swapWithinDay, todayDayNumber, weekParts, withAddedItem, withLock, withTime,
} from "../../features/itinerary/domain/plan";
import type { ItineraryItem } from "../../features/itinerary/domain/item";
import type { Reservation } from "../../packages/contracts/reservation";

let n = 0;
const item = (title: string, day: number, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: `id-${title}`, title, day_index: day, position: undefined, metadata: null, created_at: `2026-10-0${1 + (n++ % 9)}T00:00:00Z`, ...over,
});
const at = (title: string, day: number, position: number, over: Partial<ItineraryItem> = {}) => item(title, day, { position, ...over });
const titles = (list: ItineraryItem[]) => list.map((i) => i.title);

describe("ordering and grouping", () => {
  it("orders by position, then by when it was added", () => {
    const a = at("A", 1, 1), b = at("B", 1, 0), c = item("C", 1, { created_at: "2026-01-01T00:00:00Z" }), d = item("D", 1, { created_at: "2026-02-01T00:00:00Z" });
    expect(titles([a, b].sort(byOrder))).toEqual(["B", "A"]);
    expect(titles([d, c].sort(byOrder))).toEqual(["C", "D"]);
  });

  it("groups stops by day, each day in plan order", () => {
    const map = groupByDay([at("B", 2, 1), at("A", 1, 0), at("C", 2, 0)]);
    expect([...map.keys()].sort()).toEqual([1, 2]);
    expect(titles(map.get(2)!)).toEqual(["C", "B"]);
  });

  it("lists days with stops, days with bookings and every planned day, once and in order", () => {
    expect(planDays([item("A", 5)], [3, 5], 2)).toEqual([1, 2, 3, 5]);
    expect(planDays([], [], 0)).toEqual([1]);
    expect(planDays([], [], 200)).toHaveLength(60);
  });

  it("finds the first located stop to centre suggestions on (lng, lat)", () => {
    expect(planCentre([item("A", 1), item("B", 1, { metadata: { latitude: 38.7, longitude: -9.1 } })])).toEqual([-9.1, 38.7]);
    expect(planCentre([item("A", 1)])).toBeUndefined();
  });

  it("replaces a stop with the same title, or appends a new one", () => {
    const a = item("A", 1), b = item("B", 2);
    expect(titles(withAddedItem([a], b))).toEqual(["A", "B"]);
    const moved = { ...a, day_index: 3 };
    expect(withAddedItem([a, b], moved)).toEqual([moved, b]);
  });

  it("puts timed stops first by the clock, then untimed ones in the order given", () => {
    const list = [item("none1", 1), item("late", 1, { metadata: { time: "18:00" } }), item("none2", 1), item("early", 1, { metadata: { time: "09:30" } })];
    expect(titles(chronological(list))).toEqual(["early", "late", "none1", "none2"]);
  });
});

describe("dates", () => {
  it("gives no date without a start date, or with a bad one", () => {
    expect(dayDate(null, 1)).toBeNull();
    expect(dayDate("nonsense", 1)).toBeNull();
    expect(isoForDay(null, 1)).toBeNull();
  });

  it("counts days from the start date", () => {
    expect(isoForDay("2026-10-30", 1)).toBe("2026-10-30");
    expect(isoForDay("2026-10-30", 3)).toBe("2026-11-01");
    expect(dayDate("2026-10-30", 3)).toMatch(/Nov/);
    expect(dayDate("2026-10-30", 3)).toMatch(/1/);
  });

  it("knows which trip day today is", () => {
    expect(todayDayNumber("2026-10-10", new Date(2026, 9, 10))).toBe(1);
    expect(todayDayNumber("2026-10-10", new Date(2026, 9, 12))).toBe(3);
    expect(todayDayNumber("2026-10-10", new Date(2026, 9, 9))).toBe(0);
    expect(todayDayNumber(null, new Date())).toBeNull();
  });

  it("shows weekday and date in the week strip, or 'Day N' without dates", () => {
    expect(weekParts(null, 4)).toEqual({ dow: "Day", num: "4" });
    expect(weekParts("2026-10-30", 3).num).toBe("1");
  });
});

describe("reorderChange", () => {
  const plan = () => [at("A", 1, 0), at("B", 1, 1), at("C", 1, 2), at("D", 2, 0)];

  it("moves a stop before another on the same day and renumbers the day", () => {
    const change = reorderChange(plan(), "C", 1, "A")!;
    expect(change.order).toEqual([
      { title: "C", dayIndex: 1, position: 0 }, { title: "A", dayIndex: 1, position: 1 }, { title: "B", dayIndex: 1, position: 2 },
    ]);
    expect(titles(change.apply(plan()).filter((i) => i.day_index === 1).sort((a, b) => a.position! - b.position!))).toEqual(["C", "A", "B"]);
  });

  it("moves to another day's end, renumbering both days", () => {
    const change = reorderChange(plan(), "A", 2, null)!;
    expect(change.order).toContainEqual({ title: "A", dayIndex: 2, position: 1 });
    expect(change.order).toContainEqual({ title: "D", dayIndex: 2, position: 0 });
    expect(change.order).toContainEqual({ title: "B", dayIndex: 1, position: 0 });
    expect(change.order).toContainEqual({ title: "C", dayIndex: 1, position: 1 });
    expect(change.apply(plan()).find((i) => i.title === "A")!.day_index).toBe(2);
  });

  it("goes to the end when the 'before' stop is not on that day", () => {
    expect(reorderChange(plan(), "A", 2, "ghost")!.order.find((o) => o.title === "A")).toMatchObject({ dayIndex: 2, position: 1 });
  });

  it("refuses a locked or unknown stop", () => {
    const locked = [at("A", 1, 0, { metadata: { locked: true } })];
    expect(reorderChange(locked, "A", 2, null)).toBeNull();
    expect(reorderChange(plan(), "Z", 2, null)).toBeNull();
  });

  it("leaves untouched days alone", () => {
    const change = reorderChange([...plan(), at("E", 3, 0)], "A", 1, "C")!;
    expect(change.order.every((o) => o.dayIndex === 1)).toBe(true);
  });
});

describe("swapWithinDay", () => {
  const day = () => [at("A", 1, 0), at("B", 1, 1), at("C", 1, 2)];

  it("swaps with the next stop and renumbers", () => {
    const r = swapWithinDay(day(), day()[0], 1);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.change.order.map((o) => o.title)).toEqual(["B", "A", "C"]);
  });

  it("swaps with the previous stop", () => {
    const r = swapWithinDay(day(), day()[2], -1);
    if (r.kind === "ok") expect(r.change.order.map((o) => `${o.title}${o.position}`)).toEqual(["A0", "C1", "B2"]);
    else throw new Error("expected ok");
  });

  it("says edge at the ends of the day", () => {
    expect(swapWithinDay(day(), day()[0], -1).kind).toBe("edge");
    expect(swapWithinDay(day(), day()[2], 1).kind).toBe("edge");
  });

  it("refuses a locked stop, and a locked neighbour", () => {
    const locked = [at("A", 1, 0, { metadata: { locked: true } }), at("B", 1, 1), at("C", 1, 2, { metadata: { locked: true } })];
    expect(swapWithinDay(locked, locked[0], 1).kind).toBe("locked");
    expect(swapWithinDay(locked, locked[1], 1).kind).toBe("neighbour-locked");
  });
});

describe("small edits", () => {
  it("never moves a stop before day 1", () => {
    expect(dayAfterMove(item("A", 1), -1)).toBe(1);
    expect(dayAfterMove(item("A", 3), -1)).toBe(2);
    expect(dayAfterMove(item("A", 3), 1)).toBe(4);
  });

  it("locks and unlocks only the named stop, keeping other metadata", () => {
    const a = item("A", 1, { metadata: { time: "10:00" } }), b = item("B", 1);
    const out = withLock([a, b], a, true);
    expect(out[0].metadata).toEqual({ time: "10:00", locked: true });
    expect(out[1]).toBe(b);
    expect(withLock(out, out[0], false)[0].metadata).toEqual({ time: "10:00", locked: false });
  });

  it("sets and clears a time", () => {
    const a = item("A", 1, { metadata: { locked: false } });
    const set = withTime([a], a, "08:15");
    expect(set[0].metadata).toEqual({ locked: false, time: "08:15" });
    expect(withTime(set, set[0], null)[0].metadata).toEqual({ locked: false });
  });
});

describe("bookedLabel", () => {
  const res = { startTime: "09:00", endTime: "17:30" } as Reservation;
  it("shows the time, or 'Booked' without one", () => {
    expect(bookedLabel(res, null)).toMatch(/9/);
    expect(bookedLabel({ ...res, startTime: null } as Reservation, null)).toBe("Booked");
  });
  it("adds the note, using the end time for arrivals and check-outs", () => {
    expect(bookedLabel(res, "Departs")).toMatch(/^Departs .*9/);
    expect(bookedLabel(res, "Arrives")).toMatch(/^Arrives .*5/);
    expect(bookedLabel({ ...res, endTime: null } as Reservation, "Check-out")).toBe("Check-out");
  });
});

describe("cityOfDay", () => {
  const trip = { destination: "Paris, Rome", start_date: "2026-10-01", end_date: "2026-10-06", stops: [
    { city: "Paris", startDate: "2026-10-01", endDate: "2026-10-03" },
    { city: "Rome", startDate: "2026-10-04", endDate: "2026-10-06" },
  ] };

  it("names the city of each day on a multi-city trip", () => {
    expect(cityOfDay(trip, "2026-10-01", 2, new Map())).toBe("Paris");
    expect(cityOfDay(trip, "2026-10-01", 5, new Map())).toBe("Rome");
  });

  it("is null on a single-city trip or with no trip", () => {
    expect(cityOfDay(null, "2026-10-01", 1, new Map())).toBeNull();
    expect(cityOfDay({ destination: "Paris", start_date: "2026-10-01", end_date: "2026-10-03" }, "2026-10-01", 1, new Map())).toBeNull();
  });

  it("calls the day a flight leaves for the new city the move between the two", () => {
    const flight = { reservation: { kind: "flight" } as Reservation, note: "Departs" };
    expect(cityOfDay(trip, "2026-10-01", 4, new Map([[4, [flight as never]]]))).toBe("Paris → Rome");
    const arrival = { reservation: { kind: "flight" } as Reservation, note: "Arrives" };
    expect(cityOfDay(trip, "2026-10-01", 4, new Map([[4, [arrival as never]]]))).toBe("Rome");
  });
});
