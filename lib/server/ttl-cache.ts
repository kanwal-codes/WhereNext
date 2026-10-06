import Redis from "ioredis";

/**
 * `cached(key, ttlMs, load)` — one loader call per key per TTL, with in-flight dedupe
 * and stale-while-revalidate: past the TTL a stale value is served immediately while a
 * single background refresh runs. Backed by Redis when REDIS_URL is set (the recommended
 * production path — shared across instances), otherwise an in-process map (single-instance
 * fallback). Values must be JSON-serializable.
 *
 * ponytail: SWR only. A genuinely cold key can still fan out one load per process/instance;
 * add a Redis SETNX lease if a provider quota ever actually gets hit.
 */

type Entry<T> = { expiresAt: number; value: Promise<T> };
const entries = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const maxEntries = 256;
const PREFIX = "npb:cache:";
/** How long a value physically lingers past its TTL so it can be served stale during a refresh. */
const STALE_FACTOR = 4;

const stats = { hits: 0, misses: 0, staleServes: 0, refreshes: 0 };
/** Snapshot of cache activity since process start — surfaced by /api/ready. */
export function cacheStats() {
  return { ...stats, backend: redis && redis.status === "ready" ? "redis" : "memory" };
}

let redis: Redis | null | undefined;

function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    // On serverless (Vercel), every cold function instance starts with an empty in-process
    // map — without Redis, most of this cache's real-world hit rate (and the daily rate-limit
    // ceiling in rate-limit.ts, which shares this same fallback) silently evaporates in
    // production. Loud on purpose: this is easy to miss since the app runs fine either way.
    if (process.env.NODE_ENV === "production") {
      console.warn("[ttl-cache] REDIS_URL is not set in production — falling back to a per-instance in-memory cache. Provider caching and the daily AI rate limit will not be shared across serverless instances.");
    }
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
/** Size cap only — expired entries are intentionally kept so SWR can serve them stale. */
function evictMemory() {
  while (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
}

function cachedMemory<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const current = entries.get(key) as Entry<T> | undefined;
  const now = Date.now();
  if (current && current.expiresAt > now) {
    stats.hits += 1;
    return current.value;
  }
  const run = () => {
    const value = load().catch((error) => {
      entries.delete(key);
      throw error;
    });
    entries.set(key, { expiresAt: Date.now() + ttlMs, value });
    return value;
  };
  if (current) {
    // Serve stale, refresh once in the background (dedupe via `inflight`).
    stats.staleServes += 1;
    if (!inflight.has(key)) {
      stats.refreshes += 1;
      const refresh = run().finally(() => inflight.delete(key));
      inflight.set(key, refresh);
    }
    return current.value;
  }
  stats.misses += 1;
  evictMemory();
  return run();
}

async function cachedRedis<T>(r: Redis, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined;
  const full = PREFIX + key;

  let stored: { v: T; exp: number } | undefined;
  try {
    const hit = await r.get(full);
    if (hit !== null) stored = JSON.parse(hit) as { v: T; exp: number };
  } catch {
    /* fall through */
  }

  const fresh = stored && stored.exp > Date.now();
  if (fresh) {
    stats.hits += 1;
    return stored!.v;
  }

  const run = () => {
    const p = (async () => {
      const value = await load();
      try {
        await r.set(full, JSON.stringify({ v: value, exp: Date.now() + ttlMs }), "PX", Math.max(1, Math.round(ttlMs * STALE_FACTOR)));
      } catch {
        /* cache write failures are not the caller's problem */
      }
      return value;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };

  if (stored) {
    // Stale but present — serve it, kick one refresh.
    stats.staleServes += 1;
    if (!pending) {
      stats.refreshes += 1;
      void run();
    }
    return stored.v;
  }
  stats.misses += 1;
  return pending ?? run();
}

/** Keys longer than this are not cached at all: several callers build keys from request text, and an
 *  unbounded key is an unbounded memory/Redis entry that anyone can mint. */
const MAX_KEY_LENGTH = 512;

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  if (key.length > MAX_KEY_LENGTH) return load();
  const r = client();
  return r && r.status === "ready" ? cachedRedis(r, key, ttlMs, load) : cachedMemory(key, ttlMs, load);
}

/** Drop one key from both layers — for a write that must be visible on the next
 *  read immediately, not after the TTL (stale-while-revalidate would otherwise still
 *  hand back the pre-write value at least once). */
export async function invalidate(key: string): Promise<void> {
  entries.delete(key);
  inflight.delete(key);
  const r = client();
  // A cold instance has just started connecting (see client()): wait briefly for it instead of
  // skipping the delete, which left a revoked share link served from Redis until its TTL.
  if (r && r.status !== "ready" && r.status !== "end") {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1_500);
      r.once("ready", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (r && r.status === "ready") {
    try {
      await r.del(PREFIX + key);
    } catch {
      /* best-effort — a stray Redis error here must not fail the caller's write */
    }
  }
}

/** Test hook: forget everything in the in-process cache and reset counters. */
export function clearMemoryCache() {
  entries.clear();
  inflight.clear();
  stats.hits = stats.misses = stats.staleServes = stats.refreshes = 0;
}
