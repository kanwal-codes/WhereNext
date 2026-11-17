import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { searchStays } from "@/packages/providers/liteapi/client";
import { applyStayFilters, hasStayFilters, type StayFilters } from "@/packages/contracts/stay-filter";
import { searchGoogleHotels } from "@/packages/providers/serpapi/hotels";
import { stayProvider } from "@/lib/server/stay-provider";
import { resolveStayDates, staysCacheKey } from "@/lib/application/stay-dates";
import { resolveCurrency } from "@/lib/currency";
import { loadTravellerDefaults, withTravellerDefaults } from "@/lib/server/traveller-defaults";
import { cached, invalidate } from "@/lib/server/ttl-cache";

/** How many priced hotels one search of the provider keeps. */
const BASE_LIMIT = 30;
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

    const filters: StayFilters = {
      starRatings: nums(q.get("stars")),
      boards: strs(q.get("boards")),
      refundableOnly: q.get("refundable") === "1",
      priceMin: Number(q.get("priceMin")) || undefined,
      priceMax: Number(q.get("priceMax")) || undefined,
      sort: (["price", "price_desc", "rating", "stars"] as const).includes(q.get("sort") as never) ? (q.get("sort") as NonNullable<StayFilters["sort"]>) : "price",
      propertyTypes: strs(q.get("propertyTypes")),
    };

    const prefix = provider === "serpapi" ? "serp:" : "";
    // One search of the provider per place, dates and party, cached with no filter in its key: the filters and the order only choose among the hotels
    // it priced (`applyStayFilters`), so changing one is arithmetic, not a second five-second round trip to the hotel sites.
    const fetchPriced = (f: StayFilters) => async () => {
      // Google Hotels takes a place name and guests (no room count): real hotels, with prices from several sites.
      if (provider === "serpapi") {
        let out = await searchGoogleHotels({ location, checkin, checkout, adults, currency, limit: BASE_LIMIT, ...f }, request.signal);
        // A qualified place Google Hotels doesn't resolve ("Old Town, Dubrovnik") retries as the bare first part.
        const bare = location.split(",")[0]?.trim();
        if (out.options.length === 0 && out.facets.priceMax === 0 && bare && bare !== location) out = await searchGoogleHotels({ location: bare, checkin, checkout, adults, currency, limit: BASE_LIMIT, ...f }, request.signal);
        return { ...out, retrievedAt: new Date().toISOString() };
      }
      const anchor = (await new GooglePlacesProvider().search(location, request.signal).catch(() => null))?.[0];
      const out = await searchStays(
        {
          ...(anchor ? { latitude: anchor.latitude, longitude: anchor.longitude } : { city: location }),
          checkin, checkout, adults, rooms, currency, limit: BASE_LIMIT, ...f,
        },
        request.signal,
      );
      return { ...out, retrievedAt: new Date().toISOString() };
    };
    const baseKey = `stays-base:${prefix}${staysCacheKey({ location, checkin, checkout, adults, rooms, currency, filters: {} })}`;
    const base = await cached(baseKey, 5 * 60_000, fetchPriced({}));
    // Nothing came back before any filter applied: don't hold that for five minutes.
    if (base.options.length === 0 && base.facets.priceMax === 0) await invalidate(baseKey);

    // The first page of hotels is capped. When the filters leave too few of it, the app asks for a deeper search with them (`deep=1`),
    // which reaches further into the area; otherwise the filters are applied to what is already here.
    const capped = provider !== "serpapi" && base.options.length >= BASE_LIMIT;
    const deep = q.get("deep") === "1" && hasStayFilters(filters) && capped;
    const result = deep ? await cached(`stays-deep:${prefix}${staysCacheKey({ location, checkin, checkout, adults, rooms, currency, filters })}`, 5 * 60_000, fetchPriced(filters)) : { ...base, options: applyStayFilters(base.options, filters) };

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
      facets: base.facets,
      total: base.options.length,
      capped,
      deep,
      provider,
      freshness: { provider, retrievedAt: base.retrievedAt, cacheTtlSeconds: 300 },
    });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Stay rates are unavailable right now");
  }
});
