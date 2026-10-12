import { describe, expect, it } from "vitest";
import { committedSpend, groupAmount } from "../../lib/budget";
import type { Reservation } from "../../packages/contracts/reservation";
import type { StayDecision } from "../../packages/contracts/stay";

const reservation = (id: string, extra: Partial<Reservation> = {}): Reservation => ({ id, kind: "activity", title: `R${id}`, startsOn: null, endsOn: null, startTime: null, endTime: null, place: null, toPlace: null, confirmationCode: null, amount: null, currency: null, amountBasis: "total", travellers: null, status: "confirmed", notes: null, attachments: [], createdAt: "2026-09-01T10:00:00Z", ...extra });

const stay: StayDecision = { provider: "liteapi", hotelId: "h1", hotelName: "Memmo Alfama", roomName: "Deluxe", board: null, refundable: true, checkin: "2026-10-12", checkout: "2026-10-16", nights: 4, nightlyAmount: 214, totalAmount: 856, currency: "CAD", latitude: null, longitude: null, address: "Lisbon", thumbnail: null };

describe("committedSpend", () => {
  it("adds up priced bookings per currency, flights included, and ignores unpriced ones", () => {
    const lines = committedSpend([
      reservation("1", { kind: "stay", amount: 300, currency: "EUR" }),
      reservation("2", { kind: "flight", amount: 120.5, currency: "EUR" }),
      reservation("3", { amount: 99, currency: "CAD" }),
      reservation("4", { amount: 50, currency: null }),
      reservation("5"),
    ], null, 5);
    expect(lines).toEqual([{ currency: "EUR", total: 420.5, count: 2 }, { currency: "CAD", total: 99, count: 1 }]);
  });
  it("multiplies a per-person price by the people it covers, falling back to the trip's travellers", () => {
    expect(groupAmount(reservation("a", { amount: 60, amountBasis: "per_person", travellers: 3 }), 5)).toBe(180);
    expect(groupAmount(reservation("b", { amount: 60, amountBasis: "per_person" }), 5)).toBe(300);
    expect(groupAmount(reservation("c", { amount: 60, amountBasis: "per_person" }), null)).toBe(60);
    expect(groupAmount(reservation("d", { amount: 60 }), 5)).toBe(60);
    expect(groupAmount(reservation("e"), 5)).toBeNull();
  });
  it("leaves cancelled bookings out", () => {
    expect(committedSpend([reservation("1", { amount: 300, currency: "EUR", status: "cancelled" })], null, 2)).toEqual([]);
  });
  it("counts a stay chosen in the app, unless a hand-entered stay already covers those nights", () => {
    expect(committedSpend([], stay, 2)).toEqual([{ currency: "CAD", total: 856, count: 1 }]);
    expect(committedSpend([reservation("1", { kind: "stay", startsOn: "2026-10-12", endsOn: "2026-10-16", amount: 900, currency: "CAD" })], stay, 2)).toEqual([{ currency: "CAD", total: 900, count: 1 }]);
    expect(committedSpend([reservation("1", { kind: "stay", startsOn: "2026-11-01", endsOn: "2026-11-03", amount: 100, currency: "CAD" })], stay, 2)).toEqual([{ currency: "CAD", total: 956, count: 2 }]);
  });
});
