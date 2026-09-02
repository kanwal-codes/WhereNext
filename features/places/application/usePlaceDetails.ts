"use client";

import { useEffect, useState } from "react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { detailsToPlace, type GooglePlaceDetails } from "@/lib/places-ui";

type State = "loading" | "ready" | "error";

/**
 * Fetches a Google place's details for a trip and exposes the save /
 * add-to-itinerary actions. Shared by the full `/place/[id]` route and the
 * in-chat `PlacePanel` so the two can't drift.
 */
export function usePlaceDetails(tripId: string, placeId: string, opts: { initiallySaved?: boolean } = {}) {
  const [details, setDetails] = useState<GooglePlaceDetails | null>(null);
  const [freshness, setFreshness] = useState("");
  const [state, setState] = useState<State>("loading");
  const [saved, setSaved] = useState(Boolean(opts.initiallySaved));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

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

  async function toggleSave() {
    if (!details || busy) return;
    setBusy(true);
    try {
      if (saved) {
        const r = await fetch(`/api/trips/${tripId}/places`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerId: placeId }),
        });
        if (!r.ok) throw new Error();
        setSaved(false);
      } else {
        const place = detailsToPlace(details);
        if (!place) throw new Error();
        const r = await fetch(`/api/trips/${tripId}/places`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(place),
        });
        if (!r.ok) throw new Error();
        setSaved(true);
      }
      announceWorkspaceChange("places");
      setNotice("");
    } catch {
      setNotice("That change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function addToItinerary() {
    if (!details || busy) return;
    setBusy(true);
    const r = await fetch("/api/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "add_itinerary_item", tripId, title: details.displayName?.text ?? "Place", dayIndex: 1 }),
    });
    setBusy(false);
    if (r.ok) {
      announceWorkspaceChange("itinerary");
      setNotice("Added to Day 1.");
    } else setNotice("Could not add to the itinerary.");
  }

  return { details, freshness, state, saved, busy, notice, toggleSave, addToItinerary };
}
