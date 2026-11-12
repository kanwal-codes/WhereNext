"use client";

import { useEffect, useState } from "react";
import { photoProxyUrl } from "@/lib/places-ui";
import { decodeCover, encodeCover } from "@/lib/cover-photo";

// One lookup per destination per session — belt-and-suspenders alongside the DB-persisted
// answer below for a trip whose hero_photo_name hasn't loaded yet on this render.
const cache = new Map<string, string | null>();

/**
 * A real photo of the trip's destination via Google Places (through the authenticated proxy).
 * `undefined` while loading, `null` when the provider has none.
 *
 * The resolved photo name is persisted on the trip row (`hero_photo_name`) the first time it's
 * found, so every later load — this session or a new device — reads it straight off the trip
 * instead of re-running the Places search. `heroPhotoName` is read through `decodeCover` (lib/cover-photo.ts): a value stored by the old picking rule counts as
 * "never looked" and is chosen again once.
 */
export function useDestinationPhoto(tripId: string, destination: string | undefined, heroPhotoName?: string | null): string | null | undefined {
  const key = destination ? `${tripId}:${destination}` : "";
  const stored = decodeCover(heroPhotoName);
  const known = stored.known;
  const [photo, setPhoto] = useState<string | null | undefined>(() => {
    if (known) return stored.name ? (photoProxyUrl(tripId, stored.name) ?? null) : null;
    return key && cache.has(key) ? cache.get(key) : undefined;
  });

  useEffect(() => {
    if (known) {
      setPhoto(stored.name ? (photoProxyUrl(tripId, stored.name) ?? null) : null);
      return;
    }
    if (!key) {
      setPhoto(null);
      return;
    }
    if (cache.has(key)) {
      setPhoto(cache.get(key));
      return;
    }
    let cancelled = false;
    void lookup(tripId, destination as string, key).then((url) => {
      if (!cancelled) setPhoto(url);
    });
    return () => {
      cancelled = true;
    };
  }, [tripId, destination, key, known, stored.name]);

  return photo;
}

/** Lookups running now, by key: a trip is on the home page twice (phone row and desktop card), and both ask at once. */
const inflight = new Map<string, Promise<string | null>>();

function lookup(tripId: string, destination: string, key: string): Promise<string | null> {
  const running = inflight.get(key);
  if (running) return running;
  const request = fetch(`/api/trips/${tripId}/cover?destination=${encodeURIComponent(destination)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("cover lookup failed"))))
    .then((body) => {
      const name = (body.photoName as string | null) ?? undefined;
      // Only a real photo is saved. "Nothing found" stays unsaved (the server caches it for a day), so a
      // lookup that failed or missed once is tried again on a later visit instead of sticking forever.
      if (name) {
        fetch(`/api/trips/${tripId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ heroPhotoName: encodeCover(name) }),
        }).catch(() => {});
      }
      return photoProxyUrl(tripId, name) ?? null;
    })
    .catch(() => null)
    .then((url) => {
      cache.set(key, url);
      inflight.delete(key);
      return url;
    });
  inflight.set(key, request);
  return request;
}
