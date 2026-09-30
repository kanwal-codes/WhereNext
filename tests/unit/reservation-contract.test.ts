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
  it("maps a database row to the API shape", () => {
    expect(toReservation({ id: "1", kind: "dining", title: "Ramiro", starts_on: "2026-10-14", ends_on: null, start_time: "20:30", place: null, confirmation_code: null, amount: "120", currency: "EUR", notes: null, created_at: "x" })).toMatchObject({ startsOn: "2026-10-14", startTime: "20:30", amount: 120 });
  });
});
