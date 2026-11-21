import { NextResponse } from "next/server";
import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { placeAbout } from "@/lib/server/place-about";

/** The "About" blurb for a place, for someone with no trip open. Trips have their own at /api/trips/[tripId]/places/google/about. */
export const GET = withRoute(async (request: Request) => {
  try {
    await requireUser({ limit: LIMITS.llm });
    const placeId = new URL(request.url).searchParams.get("placeId");
    if (!placeId || placeId.length > 240) return NextResponse.json({ error: "Place ID required" }, { status: 400 });
    return NextResponse.json(await placeAbout(placeId));
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place details unavailable");
  }
});
