import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { runStaySearch } from "@/lib/server/stay-request";

export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const who = await requireTripMember(tripId, { limit: LIMITS.provider });
    return await runStaySearch(request, who, tripId);
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Stay rates are unavailable right now");
  }
});
