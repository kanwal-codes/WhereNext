import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { fail } from "@/lib/server/with-route";
import { serpConfigured } from "@/packages/providers/serpapi/client";
import { searchReturnOffers } from "@/lib/server/flight-search";
import { toFlightItem } from "@/lib/application/flight-items";
import { resolveCurrency } from "@/lib/currency";
import { loadTravellerDefaults, withTravellerDefaults } from "@/lib/server/traveller-defaults";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bodySchema = z.object({
  fromId: z.string().trim().min(1).max(60),
  toId: z.string().trim().min(1).max(60),
  departureDate: isoDay,
  returnDate: isoDay,
  departureToken: z.string().trim().min(1).max(700),
  adults: z.number().int().min(1).max(9).optional(),
});

/** The return flights that pair with one outbound of a round trip, each priced as the whole round trip. */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { limit: LIMITS.provider });
    if (!serpConfigured()) return NextResponse.json({ error: "Return flights need the flight search to be set up" }, { status: 503 });
    const input = bodySchema.parse(await request.json());
    const [prefs, defaults] = await Promise.all([
      supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
      loadTravellerDefaults(supabase, user.id, request.headers),
    ]);
    const merged = withTravellerDefaults((prefs.data?.data ?? {}) as Record<string, unknown>, defaults);
    const currency = resolveCurrency(merged);
    const country = typeof merged.country === "string" ? merged.country : undefined;
    const offers = await searchReturnOffers({
      origin: input.fromId, destination: input.toId, originId: input.fromId, destinationId: input.toId,
      departureDate: input.departureDate, returnDate: input.returnDate, departureToken: input.departureToken, currency, country, adults: input.adults,
    });
    return NextResponse.json({ items: offers.slice(0, 10).map(toFlightItem), currency });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Return flights are unavailable right now");
  }
}
