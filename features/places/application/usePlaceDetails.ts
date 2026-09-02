"use client";

import { useEffect, useState } from "react";
import { type GooglePlaceDetails } from "@/lib/places-ui";

type State = "loading" | "ready" | "error";

/**
 * Fetches a Google place's details for a trip. Shared by the full `/place/[id]`
 * route and the in-chat `PlacePanel` so the two can't drift. Add-to-trip actions
 * live in `AddToTripControl`.
 */
export function usePlaceDetails(tripId: string, placeId: string) {
  const [details, setDetails] = useState<GooglePlaceDetails | null>(null);
  const [freshness, setFreshness] = useState("");
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setDetails(null);
    fetch(`/api/trips/${tripId}/places/google?placeId=${encodeURIComponent(placeId)}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("details");
        return r.json();
      })
      .then((body) => {
        setDetails(body.place ?? null);
        setFreshness(body.freshness?.retrievedAt ? new Date(body.freshness.retrievedAt).toLocaleString() : "");
        setState(body.place ? "ready" : "error");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, [tripId, placeId]);

  return { details, freshness, state };
}
