import { NextResponse } from "next/server";
import { requireTripMember } from "@/lib/server/trip-auth";
import { getAuthorizeUrl } from "@/packages/providers/splitwise/client";
import { signState } from "@/lib/server/oauth-state";
import { logger } from "@/lib/server/logger";

/** A real browser navigation (an <a href>, not fetch) — OAuth needs the user to actually leave
 *  for Splitwise's consent screen, so errors redirect back into the app rather than returning JSON. */
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const tripId = searchParams.get("tripId");
  const fallback = NextResponse.redirect(`${origin}/trips`);
  if (!tripId) return fallback;

  const back = (message: string) => {
    const url = new URL(`${origin}/trips/${tripId}/bookings`);
    url.searchParams.set("splitwiseError", message);
    return NextResponse.redirect(url);
  };

  try {
    const { user } = await requireTripMember(tripId);
    if (!process.env.SPLITWISE_CLIENT_ID) return back("Splitwise isn't configured for this app yet.");

    const redirectUri = `${origin}/api/splitwise/callback`;
    const state = signState({ tripId, userId: user.id });
    return NextResponse.redirect(getAuthorizeUrl(redirectUri, state));
  } catch (error) {
    logger.error({ err: error, tripId }, "splitwise connect failed");
    return back("Couldn't connect to Splitwise. Try again in a moment.");
  }
}
