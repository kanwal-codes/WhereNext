import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { placeAbout } from "@/lib/server/place-about";

/** The "About" blurb for a place. Its own route so the page shows the place at once and the blurb arrives after. */
export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId, { limit: LIMITS.llm });
    const placeId = new URL(request.url).searchParams.get("placeId");
    if (!placeId) return NextResponse.json({ error: "Place ID required" }, { status: 400 });
    return NextResponse.json(await placeAbout(placeId));
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place details unavailable");
  }
});
