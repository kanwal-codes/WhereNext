"use client";

import { useEffect, useState } from "react";
import { photoProxyUrl } from "@/lib/places-ui";

// One lookup per destination per session — belt-and-suspenders alongside the DB-persisted
// answer below for a trip whose hero_photo_name hasn't loaded yet on this render.
const cache = new Map<string, string | null>();

/**
 * A real photo of the trip's destination via Google Places (through the authenticated proxy).
 * `undefined` while loading, `null` when the provider has none.
 *
 * The resolved photo name is persisted on the trip row (`hero_photo_name`) the first time it's
 * found, so every later load — this session or a new device — reads it straight off the trip
 * instead of re-running the Places search. `heroPhotoName` distinguishes "never looked" (SQL
 * null) from "looked, no photo" (empty string) — both skip the search, only the former ever ran it.
 */
export function useDestinationPhoto(tripId: string, destination: string | undefined, heroPhotoName?: string | null): string | null | undefined {
  const key = destination ? `${tripId}:${destination}` : "";
  const known = heroPhotoName != null;
  const [photo, setPhoto] = useState<string | null | undefined>(() => {
    if (known) return heroPhotoName ? (photoProxyUrl(tripId, heroPhotoName) ?? null) : null;
    return key && cache.has(key) ? cache.get(key) : undefined;
  });

  useEffect(() => {
    if (known) {
      setPhoto(heroPhotoName ? (photoProxyUrl(tripId, heroPhotoName) ?? null) : null);
      return;
    }
    if (!key) {
      setPhoto(null);
      return;
    }
    const controller = new AbortController();
    if (cache.has(key)) {
      setPhoto(cache.get(key));
      return;
    }
    fetch(`/api/trips/${tripId}/places?query=${encodeURIComponent(destination as string)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { places: [] }))
      .then((body) => {
        const first = (body.places ?? []) as Array<{ photoNames?: string[] }>;
        const name = first[0]?.photoNames?.[0];
        const url = photoProxyUrl(tripId, name) ?? null;
        cache.set(key, url);
        setPhoto(url);
        // Best-effort: an empty string means "checked, nothing" — still worth saving so this
        // trip never re-runs the search even when the destination genuinely has no photo.
        fetch(`/api/trips/${tripId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ heroPhotoName: name ?? "" }),
        }).catch(() => {});
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        cache.set(key, null);
        setPhoto(null);
      });
    return () => controller.abort();
  }, [tripId, destination, key, known, heroPhotoName]);

  return photo;
}
