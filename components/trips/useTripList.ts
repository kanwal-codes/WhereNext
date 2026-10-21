"use client";

import { useMemo, useState } from "react";
import type { TripSummary } from "@/packages/contracts/trip-summary";
import { notifyToast } from "@/lib/application/toast";
import type { TripFilter } from "@/lib/trip-status";
import { homeView } from "@/components/trips/homeView";

/** The home list: the trips, the filter tab, and deleting (or leaving) one after a confirmation. */
export function useTripList(trips: TripSummary[], userId?: string) {
  const [list, setList] = useState(trips);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TripSummary | null>(null);
  // "Today" for the whole screen, fixed for the life of the mount so nothing shifts under the reader.
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<TripFilter>("all");
  const view = useMemo(() => homeView(list, now, filter), [list, now, filter]);

  async function removeTrip(trip: TripSummary) {
    setPendingDelete(null);
    setDeleting(trip.id);
    // The owner deletes the trip for everyone on it; anyone else can only leave it (the server enforces both).
    const leaving = trip.is_owner === false;
    const response = await fetch(leaving ? `/api/trips/${trip.id}/members/${userId}` : `/api/trips/${trip.id}`, { method: "DELETE" });
    setDeleting(null);
    if (response.ok) {
      setList((current) => current.filter((t) => t.id !== trip.id));
      notifyToast(leaving ? `You left "${trip.name}".` : `"${trip.name}" deleted.`, "success");
    } else {
      notifyToast(leaving ? "You couldn’t leave that trip. Try again." : "That trip couldn’t be deleted. Try again.", "error");
    }
  }

  return { list, now, view, setFilter, deleting, pendingDelete, setPendingDelete, removeTrip };
}
