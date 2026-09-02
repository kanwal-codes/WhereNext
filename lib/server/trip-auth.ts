import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export class TripAuthError extends Error {
  constructor(readonly status: 401 | 403 | 404, message: string) {
    super(message);
    this.name = "TripAuthError";
  }
}

export type TripMember = { supabase: SupabaseClient; user: User; role: string };

/**
 * The one membership check every trip route uses.
 * 401 no session · 404 not a member (existence is not leaked) · 403 member without the required role.
 */
export async function requireTripMember(tripId: string, opts: { role?: "owner" | "editor" } = {}): Promise<TripMember> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new TripAuthError(401, "Authentication required");
  const membership = await supabase.from("trip_members").select("role").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
  if (!membership.data) throw new TripAuthError(404, "Trip not found");
  const role = String((membership.data as { role?: string }).role ?? "viewer");
  if (opts.role === "owner" && role !== "owner") throw new TripAuthError(403, "Trip owner required");
  if (opts.role === "editor" && role === "viewer") throw new TripAuthError(403, "Trip access denied");
  return { supabase, user, role };
}

/** Map a thrown TripAuthError to its response; null for anything else so the route's own handling runs. */
export function tripAuthResponse(error: unknown): NextResponse | null {
  return error instanceof TripAuthError ? NextResponse.json({ error: error.message }, { status: error.status }) : null;
}
