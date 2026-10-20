import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";

/**
 * What the "Reserve a table" sheet needs about one restaurant: how to reach it (phone, website,
 * Google Maps) and whether Google lists it as taking reservations. A small answer on purpose; the full
 * place details route also runs a web search, which this never needs.
 */
export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { user } = await requireTripMember(tripId);
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
