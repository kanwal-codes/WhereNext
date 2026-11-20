import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { runFlightSearch } from "@/lib/server/flight-request";

export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const who = await requireTripMember(tripId, { limit: LIMITS.provider });
    return await runFlightSearch(request, who, tripId);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid flight request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Flight search is unavailable right now");
  }
});
