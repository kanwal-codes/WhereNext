"use client";

/**
 * A short-lived, per-tab cache for a stay search/detail fetch — three call sites (stay search,
 * nearby-stays alternatives, hotel details) each hand-rolled their own read/write/TTL-check
 * block; one of them (hotel details) was missing the TTL check entirely, so once cached it
 * served the same rates for the rest of the browser session. Shared here so the TTL check can't
 * be forgotten again.
 */

type Entry<T> = { savedAt: number; value: T };

/** Read a value cached under `key` if it exists and is younger than `ttlMs`; undefined on a
 *  miss, an expired entry, or when storage is unavailable/malformed — callers already have a
 *  live-fetch fallback for exactly that path. */
export function readSessionCache<T>(key: string, ttlMs: number): T | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Partial<Entry<T>>;
    if (entry.value === undefined || Date.now() - (entry.savedAt ?? 0) >= ttlMs) return undefined;
    return entry.value;
  } catch {
    return undefined;
  }
}

/** Write `value` to sessionStorage under `key`, timestamped for `readSessionCache`'s TTL check. */
export function writeSessionCache<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value } satisfies Entry<T>));
  } catch {
    /* storage full or unavailable — the live fetch stays the source of truth */
  }
}
