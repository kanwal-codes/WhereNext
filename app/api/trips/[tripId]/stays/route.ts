import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { searchStays, type StaySearchInput } from "@/packages/providers/liteapi/client";
import { searchGoogleHotels } from "@/packages/providers/serpapi/hotels";
import { stayProvider } from "@/lib/server/stay-provider";
import { resolveStayDates, staysCacheKey } from "@/lib/application/stay-dates";
import { resolveCurrency } from "@/lib/currency";
import { loadTravellerDefaults, withTravellerDefaults } from "@/lib/server/traveller-defaults";
import { cached } from "@/lib/server/ttl-cache";

const nums = (v: string | null): number[] =>
  (v ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
const strs = (v: string | null): string[] => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { limit: LIMITS.provider });
    const provider = stayProvider();
    if (!provider) return NextResponse.json({ error: "Stay search is not configured" }, { status: 503 });

    const [trip, prefs, defaults] = await Promise.all([
      createTripRepository(supabase).get(tripId),
      supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
      loadTravellerDefaults(supabase, user.id, request.headers),
    ]);
    if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    const currency = resolveCurrency(withTravellerDefaults((prefs.data?.data ?? {}) as Record<string, unknown>, defaults));

    const q = new URL(request.url).searchParams;
    const location = (q.get("location") || trip.destination || "").trim();
    const adults = Math.max(1, Math.min(Number(q.get("adults")) || trip.travelers || 2, 24));
    const rooms = Math.max(1, Math.min(Number(q.get("rooms")) || 1, 8));
    const { checkin, checkout, assumed } = resolveStayDates(q.get("checkin"), q.get("checkout"), {
      checkin: (trip as { start_date?: string | null }).start_date,
      checkout: (trip as { end_date?: string | null }).end_date,
    });

    const filters: Pick<StaySearchInput, "starRatings" | "boards" | "refundableOnly" | "priceMax" | "sort" | "propertyTypes"> = {
      starRatings: nums(q.get("stars")),
      boards: strs(q.get("boards")),
      refundableOnly: q.get("refundable") === "1",
      priceMax: Number(q.get("priceMax")) || undefined,
      sort: (["price", "rating", "stars"] as const).includes(q.get("sort") as never) ? (q.get("sort") as "price" | "rating" | "stars") : "price",
      propertyTypes: strs(q.get("propertyTypes")),
    };

    const key = (provider === "serpapi" ? "serp:" : "") + staysCacheKey({ location, checkin, checkout, adults, rooms, currency, filters });
    const result = await cached(key, 5 * 60_000, async () => {
      // Google Hotels takes a place name and guests (no room count): real hotels, with prices from several sites.
      if (provider === "serpapi") {
        const out = await searchGoogleHotels({ location, checkin, checkout, adults, currency, limit: 24, ...filters }, request.signal);
        return { ...out, retrievedAt: new Date().toISOString() };
      }
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
      provider,
      freshness: { provider, retrievedAt: result.retrievedAt, cacheTtlSeconds: 300 },
    });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Stay rates are unavailable right now");
  }
});
