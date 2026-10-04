import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { fail } from "@/lib/server/with-route";
import { serpConfigured } from "@/packages/providers/serpapi/client";
import { flightPlaces } from "@/lib/server/flight-search";

/** Cities and airports to fly from or to, as `?query=Tor`. Same shape as the other place pickers, so the same combobox reads it. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId, { limit: LIMITS.provider });
    const query = new URL(request.url).searchParams.get("query")?.trim();
    if (!query || query.length < 2 || !serpConfigured()) return NextResponse.json({ suggestions: [] });
    const places = await flightPlaces(query, request.signal);
    return NextResponse.json({
      suggestions: places.slice(0, 7).map((p) => ({
        placeId: p.id,
        text: p.label,
        secondaryText: [p.kind === "airport" ? "Airport" : null, p.airports.length > 1 ? p.airports.slice(0, 3).join(" · ") : p.airports[0] ?? null, p.kind === "city" ? null : p.detail].filter(Boolean).join(" · ") || p.detail || null,
      })),
    });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place search unavailable");
  }
}
