import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { safeRedirect } from "@/lib/client/safe-redirect";
import { CLAIM_COOKIE, claimGuestTrips } from "@/lib/server/guest-claim";
import { logger } from "@/lib/server/logger";

// `next` used to be allow-listed to exactly one hardcoded path ("/reset-password/update"),
// falling back to "/trips" for anything else — including a pending invite (`/join/[token]`),
// which every OAuth and email-confirmation sign-up silently dropped as a result: a brand-new
// user finishing account creation from an invite link landed on their own trip list, having
// never actually joined the group they came for. `safeRedirect` is the same internal-path-only
// check `/sign-in` already applies to its own `redirect` param, so this generalizes to any
// deep link without opening it up to an off-site redirect.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirect(url.searchParams.get("next"), "/trips");
  const response = NextResponse.redirect(new URL(next, url.origin));
  if (!code) return NextResponse.redirect(new URL("/sign-in?error=Missing+code", url.origin));
  const env = getPublicEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.redirect(new URL("/sign-in?error=Supabase+is+not+configured", url.origin));
  }
  const store = await cookies();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const result = await supabase.auth.exchangeCodeForSession(code);
  if (result.error) return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(result.error.message)}`, url.origin));
  // A guest who came back through Google or an emailed link as an existing account brings their trip along. A failure never blocks the sign-in.
  const ticket = store.get(CLAIM_COOKIE)?.value;
  if (ticket && result.data.user) {
    await claimGuestTrips(result.data.user, ticket).catch((err) => logger.warn({ err }, "couldn't move a guest's trip after sign-in"));
    response.cookies.delete(CLAIM_COOKIE);
  }
  return response;
}
