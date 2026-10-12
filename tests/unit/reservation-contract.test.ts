import { describe, expect, it } from "vitest";
import { reservationInput, toReservation, toReservationRow } from "../../packages/contracts/reservation";

describe("reservationInput", () => {
  it("accepts a typical tour and turns empty strings into nulls", () => {
    const parsed = reservationInput.parse({ kind: "activity", title: " Sintra tour ", startsOn: "2026-10-13", endsOn: "", startTime: "10:00", place: "", confirmationCode: "GYG123", amount: "89.5", currency: "EUR", notes: "" });
    expect(parsed).toMatchObject({ title: "Sintra tour", endsOn: null, place: null, amount: 89.5, notes: null });
    expect(toReservationRow(parsed)).toMatchObject({ starts_on: "2026-10-13", start_time: "10:00", ends_on: null, amount: 89.5, confirmation_code: "GYG123" });
  });
  it("rejects a missing name, a bad time, and an end before the start", () => {
    expect(reservationInput.safeParse({ kind: "dining", title: "  ", amount: null }).success).toBe(false);
    expect(reservationInput.safeParse({ kind: "dining", title: "x", startTime: "7pm", amount: null }).success).toBe(false);
    expect(reservationInput.safeParse({ kind: "stay", title: "x", startsOn: "2026-10-16", endsOn: "2026-10-12", amount: null }).success).toBe(false);
  });
  it("defaults the new fields and accepts a flight's arrival, destination, status and basis", () => {
    const parsed = reservationInput.parse({ kind: "flight", title: "YYZ to JFK", startsOn: "2027-06-05", startTime: "07:15", endTime: "08:58", place: "YYZ", toPlace: "JFK", amount: 1137.5, currency: "CAD", amountBasis: "per_person", travellers: "5", status: "cancelled" });
    expect(toReservationRow(parsed)).toMatchObject({ end_time: "08:58", to_place: "JFK", amount_basis: "per_person", travellers: 5, status: "cancelled" });
    expect(reservationInput.parse({ kind: "other", title: "x", amount: null })).toMatchObject({ status: "confirmed", amountBasis: "total", travellers: null });
    expect(reservationInput.safeParse({ kind: "flight", title: "x", amount: null, endTime: "8pm" }).success).toBe(false);
  });
  it("maps a database row to the API shape", () => {
    expect(toReservation({ id: "1", kind: "dining", title: "Ramiro", starts_on: "2026-10-14", ends_on: null, start_time: "20:30", end_time: null, place: null, to_place: null, confirmation_code: null, amount: "120", currency: "EUR", amount_basis: null, travellers: null, status: null, notes: null, created_at: "x" })).toMatchObject({ startsOn: "2026-10-14", startTime: "20:30", amount: 120 });
  });
});
