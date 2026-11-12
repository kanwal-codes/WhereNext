"use client";

import { useEffect, useState } from "react";
import { photoProxyUrl } from "@/lib/places-ui";
import { decodeCover, encodeCover } from "@/lib/cover-photo";

// One lookup per destination per session — belt-and-suspenders alongside the DB-persisted
// answer below for a trip whose hero_photo_name hasn't loaded yet on this render.
const cache = new Map<string, string | null>();
/** Replacements for photos that stopped loading, by trip and destination: used for the rest of the session in place of the saved name. */
const healed = new Map<string, string>();

/**
 * A real photo of the trip's destination via Google Places (through the authenticated proxy).
 * `undefined` while loading, `null` when the provider has none.
 *
 * The resolved photo name is persisted on the trip row (`hero_photo_name`) the first time it's
 * found, so every later load — this session or a new device — reads it straight off the trip
 * instead of re-running the Places search. `heroPhotoName` is read through `decodeCover` (lib/cover-photo.ts): a value stored by the old picking rule counts as
 * "never looked" and is chosen again once.
 *
 * A saved name does not last: Google retires photo resource names after a while, and the proxy then answers 404, so a trip's cover
 * silently went back to the type-only card weeks after it was first picked. `stale` is the caller saying "the photo I was given
 * failed to load": the destination is looked up again (once), the new photograph replaces the dead one on screen, and its name is
 * saved on the trip so the next visit starts from a working one.
 */
export function useDestinationPhoto(tripId: string, destination: string | undefined, heroPhotoName?: string | null, stale = false): string | null | undefined {
  const key = destination ? `${tripId}:${destination}` : "";
  const stored = decodeCover(heroPhotoName);
  const known = stored.known;
  // A replacement found earlier this session wins over the saved name the page was rendered with, which may still be the dead one.
  const savedUrl = () => (key ? healed.get(key) : undefined) ?? (stored.name ? (photoProxyUrl(tripId, stored.name, undefined, false) ?? null) : null);
  const [photo, setPhoto] = useState<string | null | undefined>(() => {
    if (known) return savedUrl();
    return key && cache.has(key) ? cache.get(key) : undefined;
  });

  useEffect(() => {
    if (!stale || !key || !destination) return;
    let cancelled = false;
    void lookup(tripId, destination, `${key}#heal`).then((url) => {
      if (url) healed.set(key, url);
      if (!cancelled && url) setPhoto(url);
    });
    return () => {
      cancelled = true;
    };
  }, [stale, tripId, destination, key]);

  useEffect(() => {
    if (known) {
      setPhoto(savedUrl());
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
    // savedUrl only reads tripId, key and stored.name, all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      return photoProxyUrl(tripId, name, undefined, false) ?? null;
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
