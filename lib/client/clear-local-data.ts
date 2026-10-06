"use client";

/**
 * Forget everything this browser stored about the signed-in person. The service worker's runtime
 * caches are keyed by URL only, the offline mirror and the queued-mutation store by trip id only,
 * and the conversation cache by trip id only — none are partitioned by account, so without this a
 * shared device signed in as someone else could be handed the previous person's trip data (when the
 * network falls back to cache, or offline). Best effort: every step swallows its own failure.
 */
export async function clearLocalUserData(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      // Keep the precached app shell (static, non-personal); drop every runtime cache.
      await Promise.all(names.filter((name) => !/precache/i.test(name)).map((name) => caches.delete(name)));
    }
  } catch {
    /* cache storage unavailable */
  }
  try {
    if (typeof indexedDB !== "undefined") {
      await Promise.all(
        ["wn-offline", "wn-mutations"].map(
          (name) =>
            new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = request.onerror = request.onblocked = () => resolve();
            }),
        ),
      );
    }
  } catch {
    /* IndexedDB unavailable */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* sessionStorage unavailable */
  }
}
