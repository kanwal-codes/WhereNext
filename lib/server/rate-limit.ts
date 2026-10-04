import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

/**
 * Fixed-window rate limiter — `limit` requests per `windowMs` per key. Upstash-backed (HTTP,
 * so no TCP connection / `lazyConnect` cold-start tax on serverless — a real fit for this
 * runtime, unlike a raw `ioredis` connection) when a REST URL/token pair is available (shared
 * across instances); an in-process Map otherwise (single-instance fallback, resets on deploy —
 * acceptable here since this blunts scripted abuse, it isn't a hard security boundary).
 *
 * Live-caught: this only ever checked `UPSTASH_REDIS_REST_URL`/`_TOKEN`, but this project's
 * actual Vercel Redis integration exposes `REDIS_KV_REST_API_URL`/`_TOKEN` instead — the names
 * Vercel's own Marketplace Redis/KV integration has used at various points. Neither var was ever
 * set under the name this file was looking for, so `client()` always returned null in production
 * and every rate-limit check silently ran on the in-process fallback — meaningless protection
 * across ephemeral, multi-instance serverless functions. Checking both naming conventions makes
 * this resilient to whichever one is actually configured, without needing to know or copy the
 * underlying secret value.
 */

const memoryWindows = new Map<string, { count: number; resetAt: number }>();
const MAX_MEMORY_KEYS = 1024;

let redis: Redis | null | undefined;
function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_KV_REST_API_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

// One `Ratelimit` instance per distinct (limit, windowMs) pair — cheap to build (it holds no
// connection of its own, just config layered over the shared `client()`), cached so a hot path
// isn't reconstructing one on every call. This app currently has exactly two distinct ceilings
// (DAILY_TURN_LIMIT, DAILY_TRIP_TURN_LIMIT), so this map never grows meaningfully.
const limiters = new Map<string, Ratelimit>();
function limiterFor(limit: number, windowMs: number): Ratelimit | null {
  const r = client();
  if (!r) return null;
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({ redis: r, limiter: Ratelimit.fixedWindow(limit, `${windowMs} ms`), prefix: "npb:ratelimit", analytics: false });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

function evictMemory() {
  while (memoryWindows.size >= MAX_MEMORY_KEYS) memoryWindows.delete(memoryWindows.keys().next().value as string);
}

/** Forgets everything counted for these keys, e.g. a guest's own counters once their session is
 *  deleted, so they don't sit in Redis for the rest of a 30-day window. Best effort: if it fails
 *  the counters simply expire on their own. Never pass a per-IP key here: those must outlive the
 *  guest, they are what stops someone from starting over. */
export async function clearRateLimits(keys: string[]): Promise<void> {
  for (const key of keys) memoryWindows.delete(key);
  // Any limiter with the shared prefix can delete by identifier; the window/limit are irrelevant.
  const limiter = limiterFor(1, 1000);
  if (limiter) await Promise.allSettled(keys.map((key) => limiter.resetUsedTokens(key)));
}

/** True if `key` is still within `limit` hits per `windowMs`; false once exceeded. Fails OPEN on
 *  a Redis error — availability over strict enforcement, since this exists to blunt abuse, not
 *  to gate correctness. `failClosed` is for unauthenticated guest traffic, where an outage in the
 *  limiter must not become an open door to paid model and provider calls: it falls back to a
 *  per-instance in-memory count, so there is still a ceiling and visitors are not all refused. */
export async function withinRateLimit(key: string, limit: number, windowMs: number, opts: { failClosed?: boolean } = {}): Promise<boolean> {
  const limiter = limiterFor(limit, windowMs);
  if (limiter) {
    try {
      const { success } = await limiter.limit(key);
      return success;
    } catch {
      // Redis is unreachable or refusing writes (a full database answers every write with an
      // error). Fail open for signed-in traffic. For guests, count in this instance's memory
      // instead of refusing everyone: still a ceiling, but a limiter outage no longer locks every
      // visitor out of the front door.
      if (!opts.failClosed) return true;
    }
  }
  const now = Date.now();
  const entry = memoryWindows.get(key);
  if (!entry || entry.resetAt <= now) {
    evictMemory();
    memoryWindows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}
