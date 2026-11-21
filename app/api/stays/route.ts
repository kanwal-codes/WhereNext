import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { runStaySearch } from "@/lib/server/stay-request";

/** Stay search for someone with no trip open (the Stays tool on the home page). Trips have their own at /api/trips/[tripId]/stays. */
export const GET = withRoute(async (request: Request) => {
  try {
    return await runStaySearch(request, await requireUser({ limit: LIMITS.provider }));
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Stay rates are unavailable right now");
  }
});
