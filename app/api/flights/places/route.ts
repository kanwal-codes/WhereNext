import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { flightSuggestions } from "@/lib/server/flight-request";

export const GET = withRoute(async (request: Request) => {
  try {
    await requireUser({ limit: LIMITS.provider });
    return await flightSuggestions(request);
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place search unavailable");
  }
});
