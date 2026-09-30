import { describe, expect, it } from "vitest";
import { buildTimeline, categoryOf, countByCategory, filterByCategory, groupByDate } from "../../lib/trip-reservations";
import type { Booking } from "../../packages/contracts/booking";
import type { Reservation } from "../../packages/contracts/reservation";
import type { StayDecision } from "../../packages/contracts/stay";

const stay: StayDecision = { provider: "liteapi", hotelId: "h1", hotelName: "Memmo Alfama", roomName: "Deluxe", board: "Breakfast", refundable: true, checkin: "2026-10-12", checkout: "2026-10-16", nights: 4, nightlyAmount: 214, totalAmount: 856, currency: "CAD", latitude: null, longitude: null, address: "Lisbon", thumbnail: null };
const booking = (id: string, kind: Booking["kind"], extra: Partial<Booking> = {}): Booking => ({ id, kind, provider: kind === "stay" ? "liteapi" : "duffel", status: "confirmed", providerReference: `ref-${id}`, confirmationCode: null, currency: "CAD", totalAmount: 100, createdAt: "2026-09-01T10:00:00Z", ...extra });
const reservation = (id: string, extra: Partial<Reservation> = {}): Reservation => ({ id, kind: "activity", title: `R${id}`, startsOn: null, endsOn: null, startTime: null, place: null, confirmationCode: null, amount: null, currency: null, notes: null, createdAt: "2026-09-01T10:00:00Z", ...extra });
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
