import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";

export { GUEST_TURN_LIMIT } from "@/lib/guest-limits";
/** Per IP per day. A guest who clears cookies is a brand-new user, an IP is harder to shed. */
export const GUEST_IP_TURN_LIMIT = 30;
/** Guest sessions/trips one IP can start per day. */
export const GUEST_IP_START_LIMIT = 8;
/** Trip-API requests one guest can make per hour (opening a trip fans out to many routes). */
export const GUEST_API_LIMIT = 600;
export const DAY_MS = 24 * 60 * 60_000;
export const GUEST_WINDOW_MS = 30 * DAY_MS;

/** Supabase anonymous sign-in: a real user id that can later be upgraded in place. */
export const isGuest = (user: Pick<User, "is_anonymous"> | null | undefined) => user?.is_anonymous === true;

/** Stable, non-reversible per-client key for rate limits. */
export function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}
