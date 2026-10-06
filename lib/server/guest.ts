import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";

export { GUEST_TURN_LIMIT } from "@/lib/guest-limits";
/** A per-IP ceiling: `name` from the environment if set, else `production` in production and 100x
 *  that anywhere else. Locally every visitor arrives as the same IP (`::1`), so the real ceiling
 *  would lock a developer out of their own landing page after a handful of tries. */
function ipLimit(name: string, production: number) {
  const fromEnv = Number(process.env[name]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return process.env.NODE_ENV === "production" ? production : production * 100;
}
/** Per IP per day. A guest who clears cookies is a brand-new user, an IP is harder to shed. */
export const GUEST_IP_TURN_LIMIT = ipLimit("GUEST_IP_TURN_LIMIT", 30);
/** Guest sessions/trips one IP can start per day. */
export const GUEST_IP_START_LIMIT = ipLimit("GUEST_IP_START_LIMIT", 8);
/** Trip-API requests one guest can make per hour (opening a trip fans out to many routes). */
export const GUEST_API_LIMIT = 600;
export const DAY_MS = 24 * 60 * 60_000;
export const GUEST_WINDOW_MS = 30 * DAY_MS;

/** The rate-limit keys that belong to ONE guest (as opposed to their IP, whose counters must
 *  outlive them). Kept together so deleting a guest can forget exactly these. */
export const guestKey = {
  turns: (userId: string) => `guest-turns:${userId}`,
  trips: (userId: string) => `guest-trips:${userId}`,
  api: (userId: string) => `guest-api:${userId}`,
};
export const guestLimiterKeys = (userId: string) => [guestKey.turns(userId), guestKey.trips(userId), guestKey.api(userId)];

/** Supabase anonymous sign-in: a real user id that can later be upgraded in place. */
export const isGuest = (user: Pick<User, "is_anonymous"> | null | undefined) => user?.is_anonymous === true;

/** IPv6 addresses collapse to their /64 prefix: one subscriber normally controls a whole /64, so
 *  keying on the full address would let a single client rotate through 2^64 "different" IPs. */
export function normalizeIp(raw: string): string {
  const ip = raw.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!ip.includes(":")) return ip;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  const [head, tail = ""] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = ip.includes("::") && tail ? tail.split(":") : [];
  const fill = ip.includes("::") ? Array(Math.max(0, 8 - headParts.length - tailParts.length)).fill("0") : [];
  const groups = [...headParts, ...fill, ...(ip.includes("::") ? tailParts : [])].slice(0, 8);
  if (groups.length < 4) return ip;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/** Stable, non-reversible per-client key for rate limits. Prefers the address the platform itself
 *  stamps (`x-vercel-forwarded-for`, never client-supplied) over the client-influenceable
 *  `x-forwarded-for` chain. */
export function clientKey(request: Request) {
  const platform = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = platform || request.headers.get("x-real-ip") || forwarded || "unknown";
  return createHash("sha256").update(normalizeIp(ip)).digest("hex").slice(0, 24);
}
