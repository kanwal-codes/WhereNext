import Redis from "ioredis";

/**
 * `cached(key, ttlMs, load)` — one loader call per key per TTL, with in-flight dedupe.
 * Backed by Redis when REDIS_URL is set (shared across instances), otherwise by an
 * in-process map. Values must be JSON-serializable (every current caller returns plain data).
 */

type Entry<T> = { expiresAt: number; value: Promise<T> };
const entries = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const maxEntries = 256;
const PREFIX = "npb:cache:";

let redis: Redis | null | undefined;

function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    redis = null;
    return null;
  }
  redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2_000 });
  // A down Redis must never take the app down: errors are swallowed and callers fall back to loading.
  redis.on("error", () => undefined);
  void redis.connect().catch(() => undefined);
  return redis;
}

/** Drop expired entries first, then the oldest, so a hot key is not evicted ahead of a stale one. */
function evictMemory() {
  const now = Date.now();
  for (const [key, entry] of entries) if (entry.expiresAt <= now) entries.delete(key);
  while (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
}

function cachedMemory<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const current = entries.get(key) as Entry<T> | undefined;
  if (current && current.expiresAt > Date.now()) return current.value;
  if (current) entries.delete(key);
  evictMemory();
  const value = load().catch((error) => {
    entries.delete(key);
    throw error;
  });
  entries.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

async function cachedRedis<T>(r: Redis, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const run = (async () => {
    const full = PREFIX + key;
    try {
      const hit = await r.get(full);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch {
      // fall through to load
    }
    const value = await load();
    try {
      await r.set(full, JSON.stringify(value), "PX", Math.max(1, Math.round(ttlMs)));
    } catch {
      // cache write failures are not the caller's problem
    }
    return value;
  })().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const r = client();
  return r && r.status === "ready" ? cachedRedis(r, key, ttlMs, load) : cachedMemory(key, ttlMs, load);
}

/** Test hook: forget everything in the in-process cache. */
export function clearMemoryCache() {
  entries.clear();
  inflight.clear();
}
