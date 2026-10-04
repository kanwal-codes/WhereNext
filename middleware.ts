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

  // A trip that does not exist (or is not yours) should answer 404, not 200. The trip pages stream behind a loading screen, and
  // once that has started the status can no longer change, so the check is made here, before anything streams. Only for a
  // full page load (reload, typed address, shared link): moving around inside the app never reaches this.
  const claimsUser = data?.claims?.sub;
  const trip = /^\/trips\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/|$)/i.exec(request.nextUrl.pathname);
  if (claimsUser && trip && request.method === "GET" && request.headers.get("sec-fetch-dest") === "document") {
    const { data: member, error } = await supabase.from("trip_members").select("user_id").eq("trip_id", trip[1]).eq("user_id", claimsUser).maybeSingle();
    // A failed lookup (outage) is not a missing trip: let the page decide, as it always did.
    if (!error && !member) {
      const missing = NextResponse.rewrite(new URL("/trip-not-found", request.url), { status: 404 });
      response.cookies.getAll().forEach((cookie) => missing.cookies.set(cookie));
      return missing;
    }
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
