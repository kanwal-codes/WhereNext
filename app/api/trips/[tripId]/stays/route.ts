import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { liteApiConfigured, searchStays, type StaySearchInput } from "@/packages/providers/liteapi/client";
import { resolveStayDates } from "@/lib/application/stay-dates";
import { resolveCurrency } from "@/lib/currency";
import { cached } from "@/lib/server/ttl-cache";

const nums = (v: string | null): number[] =>
  (v ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
const strs = (v: string | null): string[] => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    if (!liteApiConfigured()) return NextResponse.json({ error: "Stay search is not configured" }, { status: 503 });

    const [trip, prefs] = await Promise.all([
      createTripRepository(supabase).get(tripId),
      supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
    ]);
    if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    const currency = resolveCurrency(prefs.data?.data as Record<string, unknown> | undefined);

    const q = new URL(request.url).searchParams;
    const location = (q.get("location") || trip.destination).trim();
    const adults = Math.max(1, Math.min(Number(q.get("adults")) || trip.travelers || 2, 24));
    const rooms = Math.max(1, Math.min(Number(q.get("rooms")) || 1, 8));
    const { checkin, checkout, assumed } = resolveStayDates(q.get("checkin"), q.get("checkout"), {
      checkin: (trip as { start_date?: string | null }).start_date,
      checkout: (trip as { end_date?: string | null }).end_date,
    });

    const filters: Pick<StaySearchInput, "starRatings" | "boards" | "refundableOnly" | "priceMax" | "sort"> = {
      starRatings: nums(q.get("stars")),
      boards: strs(q.get("boards")),
      refundableOnly: q.get("refundable") === "1",
      priceMax: Number(q.get("priceMax")) || undefined,
      sort: (["price", "rating", "stars"] as const).includes(q.get("sort") as never) ? (q.get("sort") as "price" | "rating" | "stars") : "price",
    };

    const key = `stays-tab:${location}:${checkin}:${checkout}:${adults}:${rooms}:${currency}:${JSON.stringify(filters)}`;
    const result = await cached(key, 5 * 60_000, async () => {
      const anchor = (await new GooglePlacesProvider().search(location, request.signal).catch(() => null))?.[0];
      const out = await searchStays(
        {
          ...(anchor ? { latitude: anchor.latitude, longitude: anchor.longitude } : { city: location }),
          checkin, checkout, adults, rooms, currency, limit: 24, ...filters,
        },
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
      adults,
      rooms,
      currency,
      options: result.options,
      facets: result.facets,
      freshness: { provider: "liteapi", retrievedAt: result.retrievedAt, cacheTtlSeconds: 300 },
    });
  } catch (error) {
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Stay rates are unavailable right now" }, { status: 503 });
  }
}
