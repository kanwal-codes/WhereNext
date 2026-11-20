import { NextResponse } from "next/server";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { LIMITS } from "@/lib/server/limits";

/** A destination's photograph for the Flights ideas, with no trip open: `{ photoName }`, or null. */
export const GET = withRoute(async (request: Request) => {
  try {
    await requireUser({ limit: LIMITS.photo });
    const destination = new URL(request.url).searchParams.get("destination")?.trim().slice(0, 160);
    if (!destination) return NextResponse.json({ photoName: null });
    return NextResponse.json({ photoName: await new GooglePlacesProvider().coverPhoto(destination, request.signal) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Cover photo unavailable");
  }
});
