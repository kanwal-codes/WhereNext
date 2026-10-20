"use client";

import { useEffect, useState } from "react";
import { type GooglePlaceDetails } from "@/lib/places-ui";
import { fetchPlaceDetails } from "@/features/places/application/placeDetailsCache";

type State = "loading" | "ready" | "error";
/** The written blurb for the About section; `source` is the web page it leaned on, when it did. */
export type PlaceAbout = { content: string; source?: { title: string; url: string } };

/**
 * Fetches a Google place's details for a trip. Shared by the full `/place/[id]`
 * route and the in-chat `PlacePanel` so the two can't drift. Add-to-trip actions
 * live in `AddToTripControl`.
 */
export function usePlaceDetails(tripId: string, placeId: string) {
  const [details, setDetails] = useState<GooglePlaceDetails | null>(null);
  const [about, setAbout] = useState<PlaceAbout | null>(null);
  const [aboutLoading, setAboutLoading] = useState(true);
  const [freshness, setFreshness] = useState("");
  const [state, setState] = useState<State>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState("loading");
    setDetails(null);
    void fetchPlaceDetails(tripId, placeId).then((body) => {
      if (!current) return;
      setDetails(body?.place ?? null);
      setFreshness(body?.freshness?.retrievedAt ? new Date(body.freshness.retrievedAt).toLocaleString() : "");
      setState(body?.place ? "ready" : "error");
    });
    return () => { current = false; };
  }, [tripId, placeId, attempt]);

  // The blurb is written after the place is on screen: it takes a moment the page should not wait for.
  useEffect(() => {
    const controller = new AbortController();
    const key = `place-about:${tripId}:${placeId}`;
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) {
        setAbout(JSON.parse(cached) as PlaceAbout | null);
        setAboutLoading(false);
        return () => controller.abort();
      }
    } catch { /* unavailable */ }
    setAbout(null);
    setAboutLoading(true);
    fetch(`/api/trips/${tripId}/places/google/about?placeId=${encodeURIComponent(placeId)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { about: null }))
      .then((body: { about?: PlaceAbout | null }) => {
        try { sessionStorage.setItem(key, JSON.stringify(body.about ?? null)); } catch { /* ignore */ }
        setAbout(body.about ?? null);
        setAboutLoading(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAboutLoading(false);
      });
    return () => controller.abort();
  }, [tripId, placeId]);

  return { details, about, aboutLoading, freshness, state, retry: () => setAttempt((n) => n + 1) };
}
