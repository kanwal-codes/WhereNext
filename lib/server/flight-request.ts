import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { serpConfigured } from "@/packages/providers/serpapi/client";
import { flightPlaces, searchFlightOffers } from "@/lib/server/flight-search";
import { toFlightItem } from "@/lib/application/flight-items";
import { resolveCurrency } from "@/lib/currency";
import { localToday } from "@/lib/local-today";
import { loadTravellerDefaults, withTravellerDefaults } from "@/lib/server/traveller-defaults";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const flightBodySchema = z.object({
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

/**
 * One flight search, for a trip (its currency and start day fill what the request leaves out) or for nobody's trip (the person's own
 * currency, and a day ~6 weeks out when none was given). The caller has already checked who is asking.
 */
export async function runFlightSearch(request: Request, who: { supabase: SupabaseClient; user: User }, tripId?: string): Promise<NextResponse> {
  const input = flightBodySchema.parse(await request.json());
  if (!serpConfigured() && !process.env.DUFFEL_API_KEY) return NextResponse.json({ error: "Flight search is not configured" }, { status: 503 });

  // Never trust a stale/absent date — fall back to the trip's start, else ~6 weeks out.
  const today = localToday(request.headers);
  const [trip, prefs, defaults] = await Promise.all([
    tripId ? createTripRepository(who.supabase).get(tripId) : null,
    tripId ? who.supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle() : null,
    loadTravellerDefaults(who.supabase, who.user.id, request.headers),
  ]);
  const merged = withTravellerDefaults((prefs?.data?.data ?? {}) as Record<string, unknown>, defaults);
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
}

/** Cities and airports for `?query=`, in the shape the place combobox reads. */
export async function flightSuggestions(request: Request): Promise<NextResponse> {
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
}
