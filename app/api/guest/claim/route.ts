import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fail, withRoute } from "@/lib/server/with-route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isGuest } from "@/lib/server/guest";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { CLAIM_COOKIE, claimGuestTrips } from "@/lib/server/guest-claim";

/** Called right after a guest signs in to an existing account: moves the guest's trips to it. Always answers 200 with the trips moved (possibly none). */
export const POST = withRoute(async function POST() {
  try {
    const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
    if (!user || isGuest(user)) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    if (!(await withinRateLimit(`guest-claim:${user.id}`, 10, 60 * 60_000))) return NextResponse.json({ error: "Try again in a little while." }, { status: 429 });
    const store = await cookies();
    const tripIds = await claimGuestTrips(user, store.get(CLAIM_COOKIE)?.value);
    const response = NextResponse.json({ tripIds });
    response.cookies.delete(CLAIM_COOKIE);
    return response;
  } catch (error) {
    return fail(error, "We couldn’t bring your trip over. You’re signed in; start it again from the home page.");
  }
});
