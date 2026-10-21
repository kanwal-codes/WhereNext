"use client";

import { useEffect, useMemo, useState } from "react";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { readTrip } from "@/lib/client/offline-store";
import { tripDayIndex } from "@/lib/trip-dates";
import { readStayDecision } from "@/packages/contracts/stay";
import { reservationsByDay } from "@/lib/trip-reservations";
import { effectiveStops, stopForDate } from "@/lib/trip-stops";
import type { Reservation } from "@/packages/contracts/reservation";
import type { TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";
import { dateLineFor, isoDayOf, type ItineraryRow } from "@/features/itinerary/domain/today";

/** Everything the Today screen knows about the day: the live trip (else the copy saved for offline), which trip day it is, the stops, what is booked and where you sleep. */
export function useTodayData(tripId: string) {
  const live = useTripDataMaybe()?.data ?? null;
  const [offline, setOffline] = useState<{ data: TripWorkspaceData; savedAt: number } | null>(null);

  useEffect(() => {
    if (live) return;
    void readTrip(tripId).then(setOffline);
  }, [live, tripId]);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(new Date().getHours() * 60 + new Date().getMinutes()); }, []);

  const data = live ?? offline?.data ?? null;
  const isOffline = !live && !!offline;

  const dayIndex = useMemo(() => tripDayIndex(data?.trip.start_date), [data?.trip.start_date]);
  const items = useMemo(() => {
    const rows = ((data?.itinerary ?? []) as ItineraryRow[]).slice();
    if (dayIndex == null) return rows.sort((a, b) => a.day_index - b.day_index || (a.position ?? 0) - (b.position ?? 0));
    return rows.filter((r) => r.day_index === dayIndex).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [data?.itinerary, dayIndex]);

  const dateLine = useMemo(() => dateLineFor(data?.trip.start_date, dayIndex), [data?.trip.start_date, dayIndex]);

  const stay = useMemo(() => readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>), [data?.decisions]);

  // What is booked for today: flights and trains with their times, check-ins, tickets (their files open from here).
  const reservations = useMemo(() => (data?.reservations ?? []) as unknown as Reservation[], [data?.reservations]);
  const bookedToday = useMemo(() => (dayIndex == null ? [] : (reservationsByDay(reservations, data?.trip.start_date).get(dayIndex) ?? [])), [reservations, dayIndex, data?.trip.start_date]);
  // The stay you are in tonight: the one chosen in the app, else a booked stay whose nights include today.
  const todayDate = isoDayOf(data?.trip.start_date, dayIndex);
  const bookedStay = useMemo(
    () => (todayDate ? reservations.find((r) => r.kind === "stay" && r.status !== "cancelled" && r.startsOn && r.startsOn <= todayDate && (r.endsOn ?? r.startsOn) > todayDate) ?? null : null),
    [reservations, todayDate],
  );
  const city = useMemo(() => (data?.trip ? (stopForDate(effectiveStops(data.trip).stops, todayDate)?.city ?? null) : null), [data?.trip, todayDate]);

  return { data, offline, isOffline, now, dayIndex, items, dateLine, stay, bookedToday, bookedStay, city, todayDate };
}

export type TodayData = ReturnType<typeof useTodayData> & { data: TripWorkspaceData };
