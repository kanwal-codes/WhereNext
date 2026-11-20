import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { LIMITS } from "@/lib/server/limits";
import { placePhotoResponse } from "@/lib/server/place-photo";

export const GET = withRoute(async (request: Request) => {
  try {
    await requireUser({ limit: LIMITS.photo });
    return await placePhotoResponse(new URL(request.url).searchParams);
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place photo is unavailable");
  }
});
