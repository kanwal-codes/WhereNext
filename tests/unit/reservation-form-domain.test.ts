import { describe, expect, it } from "vitest";
import { blankDraft, draftFromReservation, isEmptyDraft, mergeFound, reservationBody } from "../../features/bookings/domain/reservation-form";
import type { Reservation } from "../../packages/contracts/reservation";

const reservation = (over: Partial<Reservation> = {}): Reservation => ({ id: "r", kind: "stay", title: "Hotel", startsOn: "2026-12-01", endsOn: null, startTime: null, endTime: null, place: null, toPlace: null, confirmationCode: null, amount: null, currency: null, amountBasis: "total", travellers: null, status: "confirmed", notes: null, attachments: [], createdAt: "x", ...over });

describe("blankDraft", () => {
  it("is an activity on the given day in the given currency, paid in total", () => {
    expect(blankDraft("EUR", "2026-12-02")).toMatchObject({ kind: "activity", title: "", startsOn: "2026-12-02", currency: "EUR", amountBasis: "total", status: "confirmed", amount: "", travellers: "" });
  });
});

describe("draftFromReservation", () => {
  it("turns what is stored into the form's strings, empty where nothing is stored", () => {
    expect(draftFromReservation(reservation(), "CAD")).toMatchObject({ kind: "stay", title: "Hotel", startsOn: "2026-12-01", endsOn: "", startTime: "", place: "", amount: "", travellers: "", currency: "CAD", notes: "" });
  });
  it("keeps the booking's own currency, and zero as a number", () => {
    const d = draftFromReservation(reservation({ currency: "USD", amount: 0, travellers: 2, amountBasis: "per_person", status: "cancelled" }), "CAD");
    expect(d).toMatchObject({ currency: "USD", amount: "0", travellers: "2", amountBasis: "per_person", status: "cancelled" });
  });
});

describe("reservationBody", () => {
  it("sends numbers as numbers and empty as null", () => {
    expect(reservationBody({ ...blankDraft("EUR", "d"), amount: "120.5", travellers: "3" })).toMatchObject({ amount: 120.5, travellers: 3 });
    expect(reservationBody(blankDraft("EUR", "d"))).toMatchObject({ amount: null, travellers: null });
    expect(reservationBody({ ...blankDraft("EUR", "d"), amount: "0" }).amount).toBe(0);
  });
});

describe("isEmptyDraft / mergeFound", () => {
  it("is empty when it has no title, date, code or price", () => {
    expect(isEmptyDraft(blankDraft("EUR", ""))).toBe(true);
    expect(isEmptyDraft({ ...blankDraft("EUR", ""), confirmationCode: "X" })).toBe(false);
    expect(isEmptyDraft({ ...blankDraft("EUR", ""), amount: "5" })).toBe(false);
  });
  it("fills only what was found", () => {
    const current = { ...blankDraft("EUR", "2026-12-02"), title: "Mine", notes: "n" };
    const found = { ...blankDraft("EUR", ""), kind: "flight" as const, title: "TAP 1350", startsOn: "", currency: "", amount: "500" };
    expect(mergeFound(current, found)).toMatchObject({ kind: "flight", title: "TAP 1350", startsOn: "2026-12-02", currency: "EUR", amount: "500", notes: "n" });
  });
});
