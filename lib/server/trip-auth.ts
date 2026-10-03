import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient, getSessionUser } from "@/lib/supabase/server";
import { GUEST_API_LIMIT, guestKey, isGuest } from "@/lib/server/guest";
import { withinRateLimit } from "@/lib/server/rate-limit";

export class TripAuthError extends Error {
  constructor(readonly status: 401 | 403 | 404 | 429, message: string) {
    super(message);
    this.name = "TripAuthError";
  }
}

export type TripMember = { supabase: SupabaseClient; user: User; role: string; guest: boolean };

/**
 * The one membership check every trip route uses.
 * 401 no session · 404 not a member (existence is not leaked) · 403 member without the required role.
 */
export async function requireTripMember(
  tripId: string,
  /** `registered` refuses guests (anonymous sessions) — for anything social or paid: invites,
   *  sharing, bookings, expenses. Guests can chat and look at their own draft trip, nothing more. */
  opts: { role?: "owner" | "editor"; registered?: boolean } = {},
): Promise<TripMember> {
  const supabase = await createSupabaseServerClient();
  const user = await getSessionUser(supabase);
  if (!user) throw new TripAuthError(401, "Authentication required");
  const guest = isGuest(user);
  if (guest && opts.registered) throw new TripAuthError(403, "Save your trip with an account to use this.");
  if (guest && !(await withinRateLimit(guestKey.api(user.id), GUEST_API_LIMIT, 60 * 60_000, { failClosed: true }))) {
    throw new TripAuthError(429, "You're moving fast — save this trip to keep going.");
  }
  const membership = await supabase.from("trip_members").select("role").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
  // A query failure (outage, timeout) must not read as "not a member" — that's a real 404 the
  // route callers treat as final (e.g. notFound() in trip layout), while this is retryable.
  if (membership.error) throw membership.error;
  if (!membership.data) throw new TripAuthError(404, "Trip not found");
  const role = String((membership.data as { role?: string }).role ?? "viewer");
  if (opts.role === "owner" && role !== "owner") throw new TripAuthError(403, "Trip owner required");
  if (opts.role === "editor" && role === "viewer") throw new TripAuthError(403, "Trip access denied");
  return { supabase, user, role, guest };
}

/** Map a thrown TripAuthError to its response; null for anything else so the route's own handling runs. */
export function tripAuthResponse(error: unknown): NextResponse | null {
  return error instanceof TripAuthError ? NextResponse.json({ error: error.message }, { status: error.status }) : null;
}
