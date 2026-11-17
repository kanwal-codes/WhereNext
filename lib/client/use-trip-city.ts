"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { currentStop, effectiveStops, findStop, isBroadPlace, type TripStop } from "@/lib/trip-stops";

type TripLike = { id?: string; destination?: string | null; start_date?: string | null; end_date?: string | null; stops?: unknown } | null | undefined;

const CHANGE = "wn:city-change";

/** A place inside the trip's destination that Stay and Discover are narrowed to: `name` is what the pill says ("Porto"), `text` what is searched ("Porto, Portugal"). */
export type TripArea = { name: string; text: string };
type StoredArea = TripArea & { within: string };

/**
 * Which city of a multi-city trip a screen is about: the one the reader picked (kept for the rest of the visit, across
 * Discover, Stay and the map), else where the group is today, else the first city. A one-city trip has no choice of city to make, but when
 * its place is too big to search as one ("Portugal", "Kerala") the reader can narrow it to a place inside it: `area`. The narrowing belongs to
 * the stop it was made in, so choosing another stop clears it. `scoped` says the screens should search `city` instead of the trip's destination.
 */
export function useTripCity(trip: TripLike): {
  stops: TripStop[]; estimated: boolean; stop: TripStop | null; city: string; setCity: (city: string) => void; hasChoice: boolean;
  /** The place the current stop is narrowed to, if any. */
  area: TripArea | null; setArea: (area: TripArea | null) => void;
  /** The current stop is a place with places inside it worth choosing between. */
  broad: boolean; parent: string; scoped: boolean;
} {
  const tripId = trip?.id ?? "";
  // Keyed on what the stops are built from, not the trip object: every workspace refresh hands over a new
  // object with the same content, and a new `stop` re-ran every search downstream of it (Discover's whole feed, three times a load).
  const stopsKey = JSON.stringify([trip?.destination ?? null, trip?.start_date ?? null, trip?.end_date ?? null, trip?.stops ?? null]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stopsKey stands in for the trip fields read here
  const { stops, estimated } = useMemo(() => effectiveStops(trip), [stopsKey]);
  const [picked, setPicked] = useState<string | null>(null);
  const [storedArea, setStoredArea] = useState<StoredArea | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        setPicked(window.sessionStorage.getItem(`wn:city:${tripId}`));
        const raw = window.sessionStorage.getItem(`wn:area:${tripId}`);
        const parsed = raw ? (JSON.parse(raw) as Partial<StoredArea>) : null;
        setStoredArea(parsed && typeof parsed.name === "string" && typeof parsed.text === "string" && typeof parsed.within === "string" ? (parsed as StoredArea) : null);
      } catch {
        /* storage blocked: the choice lasts only as long as this screen */
      }
    };
    read();
    window.addEventListener(CHANGE, read);
    return () => window.removeEventListener(CHANGE, read);
  }, [tripId]);

  const stop = useMemo(() => (picked ? findStop(stops, picked) : null) ?? currentStop(stops, new Date().toISOString().slice(0, 10)), [stops, picked]);
  const destination = (trip?.destination ?? "").trim();
  const parent = stop?.city ?? destination;
  // Memoised: a fresh object every render would change what the header pill is built from every render, and the header would re-render the page, forever.
  const area = useMemo<TripArea | null>(() => (storedArea && storedArea.within.toLowerCase() === parent.toLowerCase() ? { name: storedArea.name, text: storedArea.text } : null), [storedArea, parent]);
  const setArea = useCallback(
    (next: TripArea | null) => {
      const within = parent;
      setStoredArea(next ? { ...next, within } : null);
      try {
        if (next) window.sessionStorage.setItem(`wn:area:${tripId}`, JSON.stringify({ ...next, within }));
        else window.sessionStorage.removeItem(`wn:area:${tripId}`);
        window.dispatchEvent(new Event(CHANGE));
      } catch {
        /* storage blocked */
      }
    },
    [tripId, parent],
  );
  const setCity = useCallback(
    (city: string) => {
      setPicked(city);
      setStoredArea(null);
      try {
        window.sessionStorage.removeItem(`wn:area:${tripId}`);
        window.sessionStorage.setItem(`wn:city:${tripId}`, city);
        window.dispatchEvent(new Event(CHANGE));
      } catch {
        /* storage blocked */
      }
    },
    [tripId],
  );
  const hasChoice = stops.length > 1;
  return { stops, estimated, stop, city: area?.text ?? parent, setCity, hasChoice, area, setArea, broad: isBroadPlace(parent), parent, scoped: hasChoice || Boolean(area) };
}
