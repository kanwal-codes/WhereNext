import { createHmac, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clearRateLimits } from "@/lib/server/rate-limit";
import { guestLimiterKeys, isGuest } from "@/lib/server/guest";
import { logger } from "@/lib/server/logger";

/**
 * A guest who signs in to an account that already exists (email or Google) cannot be upgraded in
 * place, so their trips move to that account instead. Two things have to be true, and neither is
 * taken from the browser's word:
 *   1. the guest session asked for it, which the server records as a signed ticket in an httpOnly
 *      cookie (`/api/guest/claim-ticket`), set before the sign-in replaces the session;
 *   2. the account signed in for real; the claim is made as that account (`/api/guest/claim`, or
 *      `/auth-callback` for Google and email links).
 * The ticket names the guest and expires. It proves nothing about the account, so it can only ever
 * move an anonymous user's trips to whoever signed in on the same browser.
 */
export const CLAIM_COOKIE = "wn_claim";
export const CLAIM_TTL_S = 60 * 60;

const sign = (payload: string) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase admin is not configured.");
  return createHmac("sha256", key).update(`guest-claim:${payload}`).digest("base64url");
};

export const makeClaimTicket = (guestId: string, now = Date.now()) => {
  const payload = `${guestId}.${Math.floor(now / 1000) + CLAIM_TTL_S}`;
  return `${payload}.${sign(payload)}`;
};

/** The guest's id if the ticket is genuine and unexpired, else null. */
export function readClaimTicket(ticket: string | undefined, now = Date.now()): string | null {
  const [guestId, exp, mac, ...rest] = (ticket ?? "").split(".");
  if (!guestId || !exp || !mac || rest.length) return null;
  const expected = Buffer.from(sign(`${guestId}.${exp}`));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Number(exp) * 1000 > now ? guestId : null;
}

/** Moves the ticket's guest trips to `account` and deletes the guest. Returns the trip ids moved (none when there was nothing to claim). */
export async function claimGuestTrips(account: Pick<User, "id" | "is_anonymous">, ticket: string | undefined): Promise<string[]> {
  const guestId = readClaimTicket(ticket);
  if (!guestId || guestId === account.id || isGuest(account)) return [];
  const admin = createSupabaseAdminClient();
  const { data } = await admin.auth.admin.getUserById(guestId);
  if (!data.user || !isGuest(data.user)) return [];
  const { data: moved, error } = await admin.rpc("claim_guest_trips", { p_guest: guestId, p_account: account.id });
  if (error) throw error;
  // Nothing hangs off the guest any more, so deleting it is housekeeping; the daily sweep catches a miss.
  await admin.auth.admin.deleteUser(guestId).catch((err) => logger.warn({ err }, "claimed guest left behind"));
  await clearRateLimits(guestLimiterKeys(guestId)).catch(() => undefined);
  return (moved as string[] | null) ?? [];
}
