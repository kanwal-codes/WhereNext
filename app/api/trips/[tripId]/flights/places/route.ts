import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { flightSuggestions } from "@/lib/server/flight-request";

/** Cities and airports to fly from or to, as `?query=Tor`. Same shape as the other place pickers, so the same combobox reads it. */
export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId, { limit: LIMITS.provider });
    return await flightSuggestions(request);
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place search unavailable");
  }
});
