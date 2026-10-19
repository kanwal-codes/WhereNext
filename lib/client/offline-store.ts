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

/**
 * Mirror the workspace the page already holds (no second download of it). Safe to call opportunistically.
 *
 * It used to warm an imagery cache too — the static map and one full-size photo per saved place — "for the
 * Today view". The Today view renders no images at all, and those photos were fetched at the proxy's default
 * width, which is not a width any card asks for, so nothing on screen could reuse them either: a few hundred
 * KB per saved place, downloaded in the background, for nothing. A picture is cached when it is shown.
 */
export async function primeTrip(tripId: string, data: TripWorkspaceData): Promise<void> {
  if (!tripId || tripId === "rebuild-preview") return;
  try {
    const store = (await db()).transaction(STORE, "readwrite").objectStore(STORE);
    await store.put({ tripId, data, savedAt: Date.now() } satisfies StoredTrip);
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
