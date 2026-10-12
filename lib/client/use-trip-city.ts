"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { currentStop, effectiveStops, findStop, type TripStop } from "@/lib/trip-stops";

type TripLike = { id?: string; destination?: string | null; start_date?: string | null; end_date?: string | null; stops?: unknown } | null | undefined;

const CHANGE = "wn:city-change";

/**
 * Which city of a multi-city trip a screen is about: the one the reader picked (kept for the rest of the visit, across
 * Discover, Stay and the map), else where the group is today, else the first city. A one-city trip has no choice to make.
 */
export function useTripCity(trip: TripLike): { stops: TripStop[]; estimated: boolean; stop: TripStop | null; city: string; setCity: (city: string) => void; hasChoice: boolean } {
  const tripId = trip?.id ?? "";
  const { stops, estimated } = useMemo(() => effectiveStops(trip), [trip]);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        setPicked(window.sessionStorage.getItem(`wn:city:${tripId}`));
      } catch {
        /* storage blocked: the choice lasts only as long as this screen */
      }
    };
    read();
    window.addEventListener(CHANGE, read);
    return () => window.removeEventListener(CHANGE, read);
  }, [tripId]);

  const stop = useMemo(() => (picked ? findStop(stops, picked) : null) ?? currentStop(stops, new Date().toISOString().slice(0, 10)), [stops, picked]);
  const setCity = useCallback(
    (city: string) => {
      setPicked(city);
      try {
        window.sessionStorage.setItem(`wn:city:${tripId}`, city);
        window.dispatchEvent(new Event(CHANGE));
      } catch {
        /* storage blocked */
      }
    },
    [tripId],
  );
  return { stops, estimated, stop, city: stop?.city ?? (trip?.destination ?? "").trim(), setCity, hasChoice: stops.length > 1 };
}
