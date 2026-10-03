import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const env = getPublicEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new Error("Supabase is not configured.");
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll: () => store.getAll(), setAll: (items) => { try { items.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {} } } });
}

/**
 * Who is signed in, without a network round-trip. `auth.getUser()` asks Supabase Auth every time
 * (80–180 ms, and it ran four times per trip load); `getClaims()` verifies the session token's
 * signature locally against the project's cached public keys. Same identity, no wait. The one thing
 * it cannot see is a session revoked server-side before the token expires (at most an hour); row
 * policies still gate every read and write, so that is the accepted trade. Keep `getUser()` where a
 * fresh account record is the point (the account page, deleting an account).
 */
export async function getSessionUser(supabase: SupabaseClient): Promise<User | null> {
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return null;
  return {
    id: c.sub,
    aud: Array.isArray(c.aud) ? c.aud[0] : (c.aud ?? "authenticated"),
    role: c.role,
    email: c.email,
    phone: c.phone,
    app_metadata: c.app_metadata ?? {},
    user_metadata: c.user_metadata ?? {},
    is_anonymous: c.is_anonymous === true,
    created_at: "",
  } as User;
}
