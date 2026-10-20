import { useEffect, useMemo, useState } from "react";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { cachedGet } from "@/lib/client/cached-get";
import { findScheduleConflicts, reservationsByDay } from "@/lib/trip-reservations";
import type { Reservation } from "@/packages/contracts/reservation";
import type { ItineraryItem } from "../domain/item";

/** What is already booked, placed on the trip's days, and the clashes between bookings and timed stops. */
export function useBookings({ tripId, startDate, items }: { tripId: string; startDate: string | null; items: ItineraryItem[] }) {
  // What is already booked (hotels, tours, dinners), shown on its day beside what is planned. Best-effort:
  // if the request fails the itinerary simply shows no booked rows.
  const [reservations, setReservations] = useState<Reservation[]>([]);
  useEffect(() => {
    const load = () =>
      cachedGet(`/api/trips/${tripId}/reservations`, { ttlMs: 0 })
        .then((r) => (r.ok ? r.json() : { reservations: [] }))
        .then((body) => setReservations(body.reservations ?? []))
        .catch(() => undefined);
    void load();
    return subscribeWorkspaceChanges((changes) => {
      if (changes.includes("decision")) void load();
    });
  }, [tripId]);
  const bookedByDay = useMemo(() => reservationsByDay(reservations, startDate), [reservations, startDate]);
  // Stops and bookings close together in time on the same day — a heads-up, not a hard block.
  const conflictsByDay = useMemo(() => {
    const map = new Map<number, ReturnType<typeof findScheduleConflicts>>();
    for (const conflict of findScheduleConflicts(items, reservations, startDate)) map.set(conflict.day, [...(map.get(conflict.day) ?? []), conflict]);
    return map;
  }, [items, reservations, startDate]);

  return { reservations, bookedByDay, conflictsByDay };
}
