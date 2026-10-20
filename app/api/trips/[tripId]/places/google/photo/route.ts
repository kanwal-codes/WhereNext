import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { LIMITS } from "@/lib/server/limits";
import { placePhotoResponse } from "@/lib/server/place-photo";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId, { limit: LIMITS.photo });
    // The route stays authenticated (trip membership above); the response is only cached privately in
    // the browser, even though the bytes are shared server-side.
    return await placePhotoResponse(new URL(request.url).searchParams);
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place photo is unavailable");
  }
}
