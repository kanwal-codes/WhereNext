import { describe, expect, it } from "vitest";
import { committedByCurrency } from "../../features/budget/ui/BudgetSurface";
import type { Reservation } from "../../packages/contracts/reservation";

const reservation = (id: string, extra: Partial<Reservation> = {}): Reservation => ({ id, kind: "activity", title: `R${id}`, startsOn: null, endsOn: null, startTime: null, place: null, confirmationCode: null, amount: null, currency: null, notes: null, attachments: [], createdAt: "2026-09-01T10:00:00Z", ...extra });

const stayDecision = (extra: Partial<Record<string, unknown>> = {}) => ({
  kind: "stay",
  value: {
    provider: "liteapi",
    hotelId: "h1",
    hotelName: "Memmo Alfama",
    roomName: "Deluxe",
    board: "Breakfast",
    refundable: true,
    checkin: "2026-10-12",
    checkout: "2026-10-16",
    nights: 4,
    nightlyAmount: 214,
    totalAmount: 856,
    currency: "CAD",
    latitude: null,
    longitude: null,
    address: "Lisbon",
    thumbnail: null,
    ...extra,
  },
});

describe("committedByCurrency", () => {
  it("sums reservations and the locked stay by currency", () => {
    const totals = committedByCurrency(
      [reservation("a", { amount: 80, currency: "CAD" }), reservation("b", { amount: 45, currency: "CAD" })],
      [stayDecision()],
    );
    expect(totals).toEqual([["CAD", 981]]);
  });

  it("keeps different currencies apart", () => {
    const totals = committedByCurrency([reservation("a", { amount: 50, currency: "EUR" }), reservation("b", { amount: 80, currency: "CAD" })], []);
    expect(Object.fromEntries(totals)).toEqual({ EUR: 50, CAD: 80 });
  });

  it("ignores reservations with no amount or no currency", () => {
    const totals = committedByCurrency([reservation("a"), reservation("b", { amount: 20, currency: null }), reservation("c", { amount: null, currency: "CAD" })], []);
    expect(totals).toEqual([]);
  });

  it("returns nothing when there is no stay and no priced reservation", () => {
    expect(committedByCurrency([], [])).toEqual([]);
    expect(committedByCurrency([], [{ kind: "transport", value: {} }])).toEqual([]);
  });
});
