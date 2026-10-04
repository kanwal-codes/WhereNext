import { NextResponse } from "next/server";
import { fail, withRoute } from "@/lib/server/with-route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isGuest } from "@/lib/server/guest";
import { CLAIM_COOKIE, CLAIM_TTL_S, makeClaimTicket } from "@/lib/server/guest-claim";

/** Called by a guest just before they sign in to an existing account: leaves a signed ticket in a cookie so the trip can follow them. See `lib/server/guest-claim.ts`. */
export const POST = withRoute(async function POST() {
  try {
    const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
    if (!user || !isGuest(user)) return new NextResponse(null, { status: 204 });
    const response = new NextResponse(null, { status: 204 });
    response.cookies.set(CLAIM_COOKIE, makeClaimTicket(user.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: CLAIM_TTL_S });
    return response;
  } catch (error) {
    return fail(error, "Couldn't get your trip ready to move.");
  }
});
