"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { cachedGet } from "@/lib/client/cached-get";
import { buildTimeline, readFlightChoice, type TimelineItem } from "@/lib/trip-reservations";
import { useRemoveTripItem } from "@/features/bookings/application/useRemoveTripItem";
import type { Booking } from "@/packages/contracts/booking";
import type { Reservation } from "@/packages/contracts/reservation";

/**
 * Every flight on the trip, in date order: the one saved from Getting around, provider bookings, and flights typed into Bookings.
 * The same sources and the same merging as the Bookings list (`buildTimeline`), filtered to flights, so the two pages never disagree.
 */
export function useTripFlights(tripId: string) {
  const { data } = useTripData();
  const decisions = data?.decisions;
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);

  useEffect(() => {
    // An unavailable list is an empty one: the page still shows the chosen hotel.
    const load = () => {
      void cachedGet(`/api/trips/${tripId}/reservations`, { ttlMs: 0 }).then((r) => (r.ok ? r.json() : { reservations: [] })).then((b) => setReservations(b.reservations ?? [])).catch(() => setReservations((c) => c ?? []));
      void cachedGet(`/api/trips/${tripId}/bookings`, { ttlMs: 0 }).then((r) => (r.ok ? r.json() : { bookings: [] })).then((b) => setBookings(b.bookings ?? [])).catch(() => setBookings((c) => c ?? []));
    };
    load();
    return subscribeWorkspaceChanges((changes) => { if (changes.includes("decision")) load(); });
  }, [tripId]);

  const items = useMemo(
    () => buildTimeline({ reservations: reservations ?? [], bookings: bookings ?? [], stay: null, flight: readFlightChoice((decisions ?? []) as Array<{ kind: string; value: unknown }>), tripId }).filter((item) => item.kind === "flight"),
    [reservations, bookings, decisions, tripId],
  );

  const { removeDecision, removeReservation } = useRemoveTripItem(tripId);
  const remove = useCallback(async (item: TimelineItem): Promise<boolean> => {
    const { removal, reservation } = item;
    if (removal?.type === "reservation" && reservation) return removeReservation(reservation, (id) => setReservations((list) => (list ?? []).filter((r) => r.id !== id)));
    if (removal?.type === "decision") return removeDecision(removal.kind, item.title);
    return false;
  }, [removeDecision, removeReservation]);

  return { items, loading: reservations === null || bookings === null, remove };
}
