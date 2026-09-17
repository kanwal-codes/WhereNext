"use client";

import { useState } from "react";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import type { StayRoom } from "@/packages/contracts/stay";
import type { Booking } from "@/packages/contracts/booking";
import type { Flight } from "@/features/transport/ui/TransportSurface";

export type BookingSubject =
  | { kind: "flight"; tripId: string; offer: Flight }
  | { kind: "stay"; tripId: string; hotelId: string; hotelName: string; room: StayRoom & { offerId: string }; checkin: string; checkout: string; nights: number };

// rowId is a stable React key only — never sent as `id` to the booking APIs, which use that
// name for the provider's own passenger-slot id (see confirm() below).
export type PassengerForm = { rowId: string; title: string; givenName: string; familyName: string; bornOn: string; email: string; phoneNumber: string };
export type GuestForm = { rowId: string; firstName: string; lastName: string; email: string };

const makePassenger = (): PassengerForm => ({ rowId: crypto.randomUUID(), title: "mr", givenName: "", familyName: "", bornOn: "", email: "", phoneNumber: "" });
const makeGuest = (): GuestForm => ({ rowId: crypto.randomUUID(), firstName: "", lastName: "", email: "" });

export type Stage = "details" | "review" | "success";

/** Drives the details → review → confirm flow for one flight offer or hotel room. Shared by `BookingSheet`. */
export function useBookingFlow(subject: BookingSubject, onBooked?: (booking: Booking) => void) {
  const [stage, setStage] = useState<Stage>("details");
  const [submitting, setSubmitting] = useState(false);
  // Stable for the life of this flow instance (one mount = one booking attempt), so a double-
  // click or a retry of a failed `confirm()` reuses the same idempotency key — but a genuinely
  // new attempt (the sheet reopened for a second room/seat on the same rate offer) gets a fresh
  // one. Keying the idempotency key on the offer id alone made a second, real, distinct booking
  // collide with the first and get silently treated as "already booked."
  const [attemptNonce] = useState(() => crypto.randomUUID());
  const [passengers, setPassengers] = useState<PassengerForm[]>(
    subject.kind === "flight" ? subject.offer.passengerIds.map(() => makePassenger()) : [],
  );
  const [guests, setGuests] = useState<GuestForm[]>(subject.kind === "stay" ? [makeGuest()] : []);
  const [booking, setBooking] = useState<Booking | null>(null);

  const maxGuests = subject.kind === "stay" ? Math.max(1, subject.room.maxOccupancy ?? 1) : 0;

  function updatePassenger(index: number, patch: Partial<PassengerForm>) {
    setPassengers((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
  function updateGuest(index: number, patch: Partial<GuestForm>) {
    setGuests((list) => list.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }
  function addGuest() {
    setGuests((list) => (list.length >= maxGuests ? list : [...list, makeGuest()]));
  }
  function removeGuest(index: number) {
    setGuests((list) => (list.length <= 1 ? list : list.filter((_, i) => i !== index)));
  }

  const detailsComplete =
    subject.kind === "flight"
      ? passengers.every((p) => p.givenName.trim() && p.familyName.trim() && p.bornOn && p.email.trim() && p.phoneNumber.trim())
      : guests.every((g) => g.firstName.trim() && g.lastName.trim() && g.email.trim());

  async function confirm() {
    setSubmitting(true);
    try {
      const res =
        subject.kind === "flight"
          ? await fetch(`/api/trips/${subject.tripId}/flights/book`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                offerId: subject.offer.id,
                passengers: subject.offer.passengerIds.map((id, i) => ({ id, ...passengers[i], gender: passengers[i].title === "mr" ? "m" : "f" })),
                idempotencyKey: `flight:${subject.offer.id}:${attemptNonce}`,
              }),
              signal: AbortSignal.timeout(20_000),
            })
          : await fetch(`/api/trips/${subject.tripId}/stays/${encodeURIComponent(subject.hotelId)}/book`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                offerId: subject.room.offerId,
                guests: guests.map((g, i) => ({ ...g, occupancyNumber: i + 1 })),
                idempotencyKey: `stay:${subject.room.offerId}:${attemptNonce}`,
              }),
              signal: AbortSignal.timeout(20_000),
            });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Booking failed");
      const confirmed = body.booking as Booking;
      setBooking(confirmed);
      setStage("success");
      notifyToast(subject.kind === "flight" ? "Flight booked (sandbox)." : "Stay booked (sandbox).", "success");
      announceWorkspaceChange("decision");
      onBooked?.(confirmed);
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : "That didn’t book. Try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    stage,
    setStage,
    submitting,
    passengers,
    guests,
    booking,
    maxGuests,
    updatePassenger,
    updateGuest,
    addGuest,
    removeGuest,
    detailsComplete,
    confirm,
  };
}
