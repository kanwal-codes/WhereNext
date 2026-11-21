import { NextResponse } from "next/server";
import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";

/** How to reserve at one restaurant (phone, website, Google Maps, whether it takes reservations), for someone with no trip open. Trips have their own at /api/trips/[tripId]/places/table. */
export const GET = withRoute(async (request: Request) => {
  try {
    const { user } = await requireUser();
    if (!(await withinRateLimit(`table-place:${user.id}`, 40, 60_000))) {
      return NextResponse.json({ error: "Too many lookups. Try again in a moment." }, { status: 429 });
    }
    const placeId = new URL(request.url).searchParams.get("placeId")?.trim();
    if (!placeId || placeId.length > 240) return NextResponse.json({ error: "Place ID required" }, { status: 400 });
    const place = await new GooglePlacesProvider().tableDetails(placeId, request.signal);
    return NextResponse.json({
      place: {
        name: place?.displayName?.text ?? null,
        address: place?.formattedAddress ?? null,
        phone: place?.internationalPhoneNumber ?? place?.nationalPhoneNumber ?? null,
        websiteUri: place?.websiteUri ?? null,
        mapsUrl: place?.googleMapsUri ?? null,
        reservable: typeof place?.reservable === "boolean" ? place.reservable : null,
      },
    });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "That restaurant's details are unavailable right now");
  }
});
