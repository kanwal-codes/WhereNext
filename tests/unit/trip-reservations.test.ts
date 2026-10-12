import { describe, expect, it } from "vitest";
import { buildTimeline, categoryOf, countByCategory, filterByCategory, findScheduleConflicts, groupByDate, pickNextUp, reservationsByDay, tripDayFor, whenLabel } from "../../lib/trip-reservations";
import type { Booking } from "../../packages/contracts/booking";
import type { Reservation } from "../../packages/contracts/reservation";
import type { StayDecision } from "../../packages/contracts/stay";

const stay: StayDecision = { provider: "liteapi", hotelId: "h1", hotelName: "Memmo Alfama", roomName: "Deluxe", board: "Breakfast", refundable: true, checkin: "2026-10-12", checkout: "2026-10-16", nights: 4, nightlyAmount: 214, totalAmount: 856, currency: "CAD", latitude: null, longitude: null, address: "Lisbon", thumbnail: null };
const booking = (id: string, kind: Booking["kind"], extra: Partial<Booking> = {}): Booking => ({ id, kind, provider: kind === "stay" ? "liteapi" : "duffel", status: "confirmed", providerReference: `ref-${id}`, confirmationCode: null, currency: "CAD", totalAmount: 100, createdAt: "2026-09-01T10:00:00Z", ...extra });
const reservation = (id: string, extra: Partial<Reservation> = {}): Reservation => ({ id, kind: "activity", title: `R${id}`, startsOn: null, endsOn: null, startTime: null, place: null, confirmationCode: null, amount: null, currency: null, notes: null, attachments: [], createdAt: "2026-09-01T10:00:00Z", ...extra });
const flight = { from: "Toronto (YYZ)", to: "Lisbon (LIS)", airline: "TAP", fare: "642 CAD", stops: 0, minutes: 415, departAt: "2026-10-11T21:40:00", arriveAt: "2026-10-12T09:35:00" };

describe("buildTimeline", () => {
  it("shows the chosen stay and flight once, with their bookings attached", () => {
    const items = buildTimeline({ reservations: [], bookings: [booking("b1", "flight", { confirmationCode: "TP1" }), booking("b2", "stay")], stay, flight, tripId: "t" });
    expect(items.map((i) => i.id)).toEqual(["flight:choice", "stay:h1"]);
    expect(items[0]).toMatchObject({ title: "YYZ to LIS", date: "2026-10-11", time: "21:40", code: "TP1", bookingId: "b1", status: "confirmed" });
    expect(items[1]).toMatchObject({ bookingId: "b2", date: "2026-10-12", endDate: "2026-10-16" });
  });

  it("keeps a second hotel booking as its own row instead of dropping it", () => {
    const items = buildTimeline({ reservations: [], bookings: [booking("b1", "stay"), booking("b2", "stay")], stay, flight: null, tripId: "t" });
    expect(items).toHaveLength(2);
    expect(items.filter((i) => i.bookingId).map((i) => i.bookingId).sort()).toEqual(["b1", "b2"]);
  });

  it("says what removing a row deletes: hand-entered rows and unbooked locks yes, anything a provider order backs no", () => {
    const loose = buildTimeline({ reservations: [reservation("r1")], bookings: [], stay, flight, tripId: "t" });
    expect(Object.fromEntries(loose.map((i) => [i.id, i.removal]))).toEqual({
      "stay:h1": { type: "decision", kind: "stay" },
      "flight:choice": { type: "decision", kind: "flight" },
      "reservation:r1": { type: "reservation" },
    });
    const booked = buildTimeline({ reservations: [], bookings: [booking("b1", "stay"), booking("b2", "flight"), booking("b3", "stay")], stay, flight, tripId: "t" });
    expect(booked.every((i) => i.removal === null)).toBe(true);
  });

  it("orders by date then time, with undated rows last", () => {
    const items = buildTimeline({
      reservations: [
        reservation("late", { startsOn: "2026-10-13", startTime: "20:30" }),
        reservation("early", { startsOn: "2026-10-13", startTime: "10:00" }),
        reservation("none"),
        reservation("first", { startsOn: "2026-10-12" }),
      ],
      bookings: [],
      stay: null,
      flight: null,
      tripId: "t",
    });
    expect(items.map((i) => i.title)).toEqual(["Rfirst", "Rearly", "Rlate", "Rnone"]);
  });
});

describe("groupByDate, filterByCategory, countByCategory", () => {
  const items = buildTimeline({
    reservations: [reservation("a", { startsOn: "2026-10-13" }), reservation("b", { startsOn: "2026-10-13", kind: "dining" }), reservation("c", { kind: "train", startsOn: "2026-10-14" }), reservation("d")],
    bookings: [],
    stay,
    flight: null,
    tripId: "t",
  });
  it("groups rows that share a day and labels undated ones", () => {
    const groups = groupByDate(items);
    expect(groups.map((g) => g.items.length)).toEqual([1, 2, 1, 1]);
    expect(groups[groups.length - 1]!.label).toBe("Date to be added");
  });
  it("filters and counts by category", () => {
    expect(filterByCategory(items, "travel").map((i) => i.title)).toEqual(["Rc"]);
    expect(countByCategory(items)).toEqual({ all: 5, stay: 1, travel: 1, do: 3 });
    expect(filterByCategory(items, "all")).toHaveLength(5);
  });
  it("puts each kind in a category", () => {
    expect(["stay", "flight", "train", "activity", "dining", "other"].map((k) => categoryOf(k as never))).toEqual(["stay", "travel", "travel", "do", "do", "do"]);
  });
});

describe("pickNextUp and whenLabel", () => {
  const at = (day: string) => new Date(`${day}T12:00:00`).getTime();
  const items = buildTimeline({
    reservations: [reservation("tour", { startsOn: "2026-10-13" }), reservation("loose")],
    bookings: [],
    stay,
    flight,
    tripId: "t",
  });
  it("features the earliest row that has not finished", () => {
    expect(pickNextUp(items, at("2026-09-30"))?.id).toBe("flight:choice");
    expect(pickNextUp(items, at("2026-10-12"))?.id).toBe("stay:h1");
  });
  it("keeps a stay you are in as next up until check-out, then moves on", () => {
    expect(pickNextUp(items, at("2026-10-15"))?.id).toBe("stay:h1");
    expect(pickNextUp(items, at("2026-10-17"))).toBeNull();
  });
  it("never features a row with no date", () => {
    expect(pickNextUp(items.filter((i) => i.date === null), at("2026-09-30"))).toBeNull();
  });
  it("says how soon it is", () => {
    const f = items.find((i) => i.id === "flight:choice")!;
    const s = items.find((i) => i.id === "stay:h1")!;
    expect(whenLabel(f, at("2026-09-30"))).toBe("In 11 days");
    expect(whenLabel(f, at("2026-10-10"))).toBe("Tomorrow");
    expect(whenLabel(f, at("2026-10-11"))).toBe("Today");
    expect(whenLabel(s, at("2026-10-14"))).toBe("Now");
    expect(whenLabel(s, at("2026-10-20"))).toBeNull();
  });
});

describe("tripDayFor and reservationsByDay", () => {
  it("counts trip days from the start date", () => {
    expect(tripDayFor("2026-10-12", "2026-10-12")).toBe(1);
    expect(tripDayFor("2026-10-14", "2026-10-12")).toBe(3);
    expect(tripDayFor("2026-10-11", "2026-10-12")).toBeNull();
    expect(tripDayFor(null, "2026-10-12")).toBeNull();
    expect(tripDayFor("2026-10-12", null)).toBeNull();
  });
  it("puts reservations on their day, a stay on check-in and check-out, in time order", () => {
    const byDay = reservationsByDay(
      [
        reservation("dinner", { kind: "dining", startsOn: "2026-10-13", startTime: "20:30" }),
        reservation("tour", { startsOn: "2026-10-13", startTime: "10:00" }),
        reservation("hotel", { kind: "stay", startsOn: "2026-10-12", endsOn: "2026-10-14" }),
        reservation("undated"),
        reservation("early", { startsOn: "2026-10-01" }),
      ],
      "2026-10-12",
    );
    expect([...byDay.keys()].sort()).toEqual([1, 2, 3]);
    expect(byDay.get(1)!.map((e) => [e.reservation.title, e.note])).toEqual([["Rhotel", "Check-in"]]);
    expect(byDay.get(2)!.map((e) => e.reservation.title)).toEqual(["Rtour", "Rdinner"]);
    expect(byDay.get(3)!.map((e) => [e.reservation.title, e.note])).toEqual([["Rhotel", "Check-out"]]);
  });
});

describe("findScheduleConflicts", () => {
  const item = (title: string, day_index: number, time: string | null) => ({ title, day_index, metadata: time ? { time } : null });

  it("flags a stop and a reservation within an hour of each other, on the right day", () => {
    const conflicts = findScheduleConflicts(
      [item("Schwartz's Deli", 2, "19:00")],
      [reservation("dinner", { kind: "dining", startsOn: "2026-10-13", startTime: "19:30" })],
      "2026-10-12",
    );
    expect(conflicts).toEqual([{ day: 2, a: "Schwartz's Deli", b: "Rdinner", at: "19:00" }]);
  });

  it("does not flag things more than an hour apart, or on different days", () => {
    const conflicts = findScheduleConflicts(
      [item("Breakfast", 1, "08:00"), item("Museum", 1, "14:00")],
      [reservation("dinner", { startsOn: "2026-10-14", startTime: "19:00" })],
      "2026-10-12",
    );
    expect(conflicts).toEqual([]);
  });

  it("ignores stops with no time set and reservations with no day or time", () => {
    const conflicts = findScheduleConflicts(
      [item("Untimed stop", 1, null)],
      [reservation("undated"), reservation("no-time", { startsOn: "2026-10-12" })],
      "2026-10-12",
    );
    expect(conflicts).toEqual([]);
  });
});
