import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { fail } from "@/lib/server/with-route";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { serpConfigured } from "@/packages/providers/serpapi/client";
import { searchFlightOffers } from "@/lib/server/flight-search";
import { toFlightItem } from "@/lib/application/flight-items";
import { resolveCurrency } from "@/lib/currency";
import { loadTravellerDefaults, withTravellerDefaults } from "@/lib/server/traveller-defaults";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bodySchema = z.object({
  from: z.string().trim().min(1).max(120),
  to: z.string().trim().min(1).max(120),
  fromId: z.string().trim().min(1).max(60).optional(),
  toId: z.string().trim().min(1).max(60).optional(),
  departureDate: isoDay.optional(),
  returnDate: isoDay.optional(),
  adults: z.number().int().min(1).max(9).optional(),
  /** "duffel" is the bookable search the Getting around page uses; everything else gets the real fares. */
  provider: z.enum(["serpapi", "duffel"]).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { limit: LIMITS.provider });
    const input = bodySchema.parse(await request.json());
    if (!serpConfigured() && !process.env.DUFFEL_API_KEY) return NextResponse.json({ error: "Flight search is not configured" }, { status: 503 });

    // Never trust a stale/absent date — fall back to the trip's start, else ~6 weeks out.
    const today = new Date().toISOString().slice(0, 10);
    const [trip, prefs, defaults] = await Promise.all([
      createTripRepository(supabase).get(tripId),
      supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
      loadTravellerDefaults(supabase, user.id, request.headers),
    ]);
    const merged = withTravellerDefaults((prefs.data?.data ?? {}) as Record<string, unknown>, defaults);
    const currency = resolveCurrency(merged);
    const country = typeof merged.country === "string" ? merged.country : undefined;
    const tripStart = (trip as { start_date?: string | null } | null)?.start_date ?? undefined;
    const wanted = input.departureDate && input.departureDate > today ? input.departureDate : undefined;
    const departureDate = wanted ?? (tripStart && tripStart > today ? tripStart : new Date(Date.now() + 42 * 864e5).toISOString().slice(0, 10));
    const assumedDate = !wanted;
    const returnDate = input.returnDate && input.returnDate > departureDate ? input.returnDate : undefined;

    const found = await searchFlightOffers(
      { origin: input.from, destination: input.to, originId: input.fromId, destinationId: input.toId, departureDate, returnDate, currency, country, adults: input.adults, provider: input.provider },
      request.signal,
    );

    return NextResponse.json({
      // Provider-shaped, for the Getting around page, which books through them.
      offers: found.offers,
      // The same shape the chat's flights card holds, so the card can swap in a new search's fares as they are.
      items: found.offers.slice(0, 12).map(toFlightItem),
      currency,
      departureDate,
      returnDate: returnDate ?? null,
      assumedDate,
      provider: found.provider,
      insights: found.insights,
      origin: found.from,
      destination: found.to,
      freshness: { provider: found.provider, retrievedAt: new Date().toISOString(), cacheTtlSeconds: 600 },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid flight request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Flight search is unavailable right now");
  }
}
