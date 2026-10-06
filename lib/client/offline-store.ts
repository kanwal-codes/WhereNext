"use client";

import { openDB, type IDBPDatabase } from "idb";
import type { TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";

/**
 * Per-viewer offline mirror of a trip's workspace snapshot, in IndexedDB. Just
 * enough for the "Today" view to render with no network. Last-write-wins, no
 * merge — see mutation-queue for the offline edit path.
 */

const DB_NAME = "wn-offline";
const STORE = "trips";

type StoredTrip = { tripId: string; data: TripWorkspaceData; savedAt: number };

let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no IndexedDB"));
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "tripId" });
    },
  });
  return dbPromise;
}

/** Fetch the live workspace and mirror it, plus warm the imagery cache. Safe to call opportunistically. */
export async function primeTrip(tripId: string): Promise<void> {
  if (!tripId || tripId === "rebuild-preview") return;
  try {
    const res = await fetch(`/api/trips/${tripId}/workspace`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as TripWorkspaceData;
    const store = (await db()).transaction(STORE, "readwrite").objectStore(STORE);
    await store.put({ tripId, data, savedAt: Date.now() } satisfies StoredTrip);

    // Best-effort: cache the static map + place photos the Today view will show.
    if (typeof caches !== "undefined") {
      const cache = await caches.open("trip-imagery");
      const urls = new Set<string>([`/api/trips/${tripId}/map/static`]);
      for (const row of (data.savedPlaces ?? []) as Array<{ places?: { metadata?: { photoNames?: string[] } } }>) {
        const photo = row.places?.metadata?.photoNames?.[0];
        if (photo) urls.add(`/api/trips/${tripId}/places/google/photo?name=${encodeURIComponent(photo)}`);
      }
      // cache.add always goes to the network; a place photo's name never changes, so only fetch the ones not mirrored yet.
      // The static map has no stable key (its markers move), so it is always re-added (the server's max-age covers repeats).
      const fresh = await Promise.all([...urls].map(async (u) => (u.endsWith("/map/static") || !(await cache.match(u)) ? u : null)));
      await Promise.allSettled(fresh.filter((u): u is string => u !== null).map((u) => cache.add(u)));
    }
  } catch {
    // offline or storage unavailable — nothing to mirror
  }
}

export async function readTrip(tripId: string): Promise<{ data: TripWorkspaceData; savedAt: number } | null> {
  try {
    const row = (await (await db()).get(STORE, tripId)) as StoredTrip | undefined;
    return row ? { data: row.data, savedAt: row.savedAt } : null;
  } catch {
    return null;
  }
}
