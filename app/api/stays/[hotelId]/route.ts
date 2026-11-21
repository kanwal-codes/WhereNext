import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { runStayDetails } from "@/lib/server/stay-details";

/** One hotel's details and rates for someone with no trip open. Trips have their own at /api/trips/[tripId]/stays/[hotelId]. */
export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ hotelId: string }> }) => {
  try {
    const { hotelId } = await params;
    return await runStayDetails(request, hotelId, await requireUser({ limit: LIMITS.enrich }));
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Hotel details are unavailable right now");
  }
});
