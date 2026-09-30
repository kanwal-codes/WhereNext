"use client";

import { useEffect, useState } from "react";
import { type GooglePlaceDetails } from "@/lib/places-ui";

type State = "loading" | "ready" | "error";
export type WebSummary = { content: string; source: { title: string; url: string } };

/**
 * Fetches a Google place's details for a trip. Shared by the full `/place/[id]`
 * route and the in-chat `PlacePanel` so the two can't drift. Add-to-trip actions
 * live in `AddToTripControl`.
 */
export function usePlaceDetails(tripId: string, placeId: string) {
  const [details, setDetails] = useState<GooglePlaceDetails | null>(null);
  const [webSummary, setWebSummary] = useState<WebSummary | null>(null);
  const [freshness, setFreshness] = useState("");
  const [state, setState] = useState<State>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const cacheKey = `place-details:${tripId}:${placeId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const body = JSON.parse(cached);
        if (body.place) {
          setDetails(body.place);
          setWebSummary(body.webSummary ?? null);
          setFreshness(body.freshness?.retrievedAt ? new Date(body.freshness.retrievedAt).toLocaleString() : "");
          setState("ready");
          return () => controller.abort();
        }
      }
    } catch { /* unavailable or malformed cache */ }
    setState("loading");
    setDetails(null);
    setWebSummary(null);
    fetch(`/api/trips/${tripId}/places/google?placeId=${encodeURIComponent(placeId)}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("details");
        return r.json();
      })
      .then((body) => {
        try { sessionStorage.setItem(cacheKey, JSON.stringify(body)); } catch { /* ignore */ }
        setDetails(body.place ?? null);
        setWebSummary(body.webSummary ?? null);
        setFreshness(body.freshness?.retrievedAt ? new Date(body.freshness.retrievedAt).toLocaleString() : "");
        setState(body.place ? "ready" : "error");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, [tripId, placeId, attempt]);

  return { details, webSummary, freshness, state, retry: () => setAttempt((n) => n + 1) };
}
