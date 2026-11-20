import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { runFlightSearch } from "@/lib/server/flight-request";

/** Flight search for someone with no trip open (the Flights tool on the home page). Trips have their own at /api/trips/[tripId]/flights. */
export const POST = withRoute(async (request: Request) => {
  try {
    const who = await requireUser({ limit: LIMITS.provider });
    return await runFlightSearch(request, who);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid flight request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Flight search is unavailable right now");
  }
});
