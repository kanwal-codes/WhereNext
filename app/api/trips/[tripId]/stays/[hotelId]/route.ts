import { tripAuthResponse, requireTripMember } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { runStayDetails } from "@/lib/server/stay-details";

export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string; hotelId: string }> }) => {
  try {
    const { tripId, hotelId } = await params;
    const who = await requireTripMember(tripId, { limit: LIMITS.enrich });
    return await runStayDetails(request, hotelId, who, tripId);
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Hotel details are unavailable right now");
  }
});
