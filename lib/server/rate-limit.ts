import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

/**
 * Fixed-window rate limiter — `limit` requests per `windowMs` per key. Upstash-backed (HTTP,
 * so no TCP connection / `lazyConnect` cold-start tax on serverless — a real fit for this
 * runtime, unlike a raw `ioredis` connection) when `UPSTASH_REDIS_REST_URL`/
 * `UPSTASH_REDIS_REST_TOKEN` are set (shared across instances); an in-process Map otherwise
 * (single-instance fallback, resets on deploy — acceptable here since this blunts scripted
 * abuse, it isn't a hard security boundary).
 */

const memoryWindows = new Map<string, { count: number; resetAt: number }>();
const MAX_MEMORY_KEYS = 1024;

let redis: Redis | null | undefined;
function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
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

/** True if `key` is still within `limit` hits per `windowMs`; false once exceeded. Fails OPEN on
 *  a Redis error — availability over strict enforcement, since this exists to blunt abuse, not
 *  to gate correctness. */
export async function withinRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const limiter = limiterFor(limit, windowMs);
  if (limiter) {
    try {
      const { success } = await limiter.limit(key);
      return success;
    } catch {
      return true;
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
