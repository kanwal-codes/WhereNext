"use client";

import { useEffect, useState } from "react";
import { photoProxyUrl } from "@/lib/places-ui";

// One lookup per destination per session — the Overview hero shouldn't cost a Places call on every visit.
const cache = new Map<string, string | null>();

/**
 * A real photo of the trip's destination via Google Places (through the authenticated
 * proxy). `undefined` while loading, `null` when the provider has none.
 */
export function useDestinationPhoto(tripId: string, destination: string | undefined): string | null | undefined {
  const key = destination ? `${tripId}:${destination}` : "";
  const [photo, setPhoto] = useState<string | null | undefined>(() => (key && cache.has(key) ? cache.get(key) : undefined));

  useEffect(() => {
    if (!key) {
      setPhoto(null);
      return;
    }
    if (cache.has(key)) {
      setPhoto(cache.get(key));
      return;
    }
    const controller = new AbortController();
    fetch(`/api/trips/${tripId}/places?query=${encodeURIComponent(destination as string)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { places: [] }))
      .then((body) => {
        const first = (body.places ?? []) as Array<{ photoNames?: string[] }>;
        const url = photoProxyUrl(tripId, first[0]?.photoNames?.[0]) ?? null;
        cache.set(key, url);
        setPhoto(url);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        cache.set(key, null);
        setPhoto(null);
      });
    return () => controller.abort();
  }, [tripId, destination, key]);

  return photo;
}
