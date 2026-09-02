import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { hotelDetails, liteApiConfigured, stayRooms } from "@/packages/providers/liteapi/client";
import { resolveStayDates } from "@/lib/application/stay-dates";
import { cached } from "@/lib/server/ttl-cache";

/** Hotel content + dated room rates. Each half degrades independently to `null`. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string; hotelId: string }> }) {
  try {
    const { tripId, hotelId } = await params;
    await requireTripMember(tripId);
    if (!liteApiConfigured()) return NextResponse.json({ error: "Stay search is not configured" }, { status: 503 });

    const search = new URL(request.url).searchParams;
    const adults = Math.max(1, Math.min(Number(search.get("adults")) || 2, 8));
    const { checkin, checkout, assumed } = resolveStayDates(search.get("checkin"), search.get("checkout"));

    const [details, rates] = await Promise.allSettled([
      cached(`stay:details:${hotelId}`, 10 * 60_000, () => hotelDetails(hotelId, request.signal)),
      cached(`stay:rooms:${hotelId}:${checkin}:${checkout}:${adults}`, 5 * 60_000, () => stayRooms({ hotelId, checkin, checkout, adults }, request.signal)),
    ]);
    if (details.status === "rejected" && rates.status === "rejected") {
      return NextResponse.json({ error: "Hotel details are unavailable right now" }, { status: 503 });
    }
    const nights = rates.status === "fulfilled" ? rates.value.nights : Math.max(1, Math.round((Date.parse(checkout) - Date.parse(checkin)) / 864e5));
    return NextResponse.json({
      hotel: details.status === "fulfilled" ? details.value : null,
      rooms: rates.status === "fulfilled" ? rates.value.rooms : null,
      nights,
      checkin,
      checkout,
      assumedDates: assumed,
      freshness: { provider: "liteapi", retrievedAt: new Date().toISOString(), cacheTtlSeconds: 300 },
    });
  } catch (error) {
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Hotel details are unavailable right now" }, { status: 503 });
  }
}
