import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidate } from "@/lib/server/ttl-cache";

/**
 * Accept a trip invite. POST only, and only from this site's own join page: opening /join/<token> used
 * to join a signed-in visitor on a plain GET, so any other site could navigate a signed-in person to
 * an attacker's invite link (a top-level GET carries Lax auth cookies) and enrol them without a click.
 * A cross-site POST does not carry the session cookie at all; the Origin check is belt and braces.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = (suffix = "") => NextResponse.redirect(new URL(`/join/${encodeURIComponent(token)}${suffix}`, request.url), 303);

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return back();
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return back();

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return back();

  const { data: tripId, error } = await supabase.rpc("accept_trip_invite", { p_token: token });
  if (error) return back("?error=retry");
  if (!tripId) return back("?error=dead");

  // The RPC inserts the member row directly in Postgres, so the members routes' own cache
  // invalidation never runs; clear it here so the new member shows up immediately.
  await Promise.all([invalidate(`members:${tripId}`), invalidate(`member-identities:${tripId}`)]);
  return NextResponse.redirect(new URL(`/trips/${tripId}/group?joined=1`, request.url), 303);
}
