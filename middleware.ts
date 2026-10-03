import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { ACCOUNT_REQUIRED, guestDecision } from "@/lib/guest-policy";

export async function middleware(request: NextRequest) {
  const env = getPublicEnv(); const response = NextResponse.next({ request });
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return response;
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => { request.cookies.set(name, value); response.cookies.set(name, value, options); }) } });
  // Verified locally from the session token (no call to Supabase Auth); also refreshes it when due.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ? { is_anonymous: data.claims.is_anonymous === true } : null;

  // Guests (anonymous sessions) may only use Roam: everything else is closed here, for pages and
  // APIs alike, whatever the UI does (see lib/guest-policy.ts).
  if (user?.is_anonymous === true) {
    const { pathname } = request.nextUrl;
    const decision = guestDecision(pathname, request.method);
    if (!decision.allow) {
      const denied = decision.kind === "api"
        ? NextResponse.json(ACCOUNT_REQUIRED, { status: 403 })
        : NextResponse.redirect(new URL(decision.redirectTo, request.url));
      // Keep any session refresh the auth client just did.
      response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
      return denied;
    }
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
