import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { liteApiConfigured, searchStays } from "@/packages/providers/liteapi/client";
import { resolveStayDates } from "@/lib/application/stay-dates";
import { cached } from "@/lib/server/ttl-cache";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    if (!liteApiConfigured()) return NextResponse.json({ error: "Stay search is not configured" }, { status: 503 });

    const trip = await createTripRepository(supabase).get(tripId);
    if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

    const search = new URL(request.url).searchParams;
    const location = (search.get("location") || trip.destination).trim();
    const adults = Math.max(1, Math.min(Number(search.get("adults")) || trip.travelers || 2, 8));
    const { checkin, checkout, assumed } = resolveStayDates(search.get("checkin"), search.get("checkout"));

    const key = `stays-tab:${location}:${checkin}:${checkout}:${adults}`;
    const result = await cached(key, 5 * 60_000, async () => {
      const hits = await new GooglePlacesProvider().search(location, request.signal).catch(() => null);
      const anchor = hits?.[0];
      const out = await searchStays(
        anchor
          ? { latitude: anchor.latitude, longitude: anchor.longitude, checkin, checkout, adults, limit: 24 }
          : { city: location, checkin, checkout, adults, limit: 24 },
        request.signal,
      );
      return { ...out, retrievedAt: new Date().toISOString() };
    });

    return NextResponse.json({
      location,
      checkin,
      checkout,
      assumedDates: assumed,
      nights: result.nights,
      options: result.options,
      freshness: { provider: "liteapi", retrievedAt: result.retrievedAt, cacheTtlSeconds: 300 },
    });
  } catch (error) {
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Stay rates are unavailable right now" }, { status: 503 });
  }
}
