import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { searchFlights } from "@/packages/providers/duffel/client";
import { cached } from "@/lib/server/ttl-cache";

const bodySchema = z.object({
  from: z.string().trim().min(1).max(120),
  to: z.string().trim().min(1).max(120),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  adults: z.number().int().min(1).max(9).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    if (!process.env.DUFFEL_API_KEY) return NextResponse.json({ error: "Flight search is not configured" }, { status: 503 });
    const input = bodySchema.parse(await request.json());

    // Never trust a stale/absent date — fall back to the trip's start, else ~6 weeks out.
    const today = new Date().toISOString().slice(0, 10);
    const trip = await createTripRepository(supabase).get(tripId);
    const tripStart = (trip as { start_date?: string | null } | null)?.start_date ?? undefined;
    const wanted = input.departureDate && input.departureDate > today ? input.departureDate : undefined;
    const departureDate = wanted ?? (tripStart && tripStart > today ? tripStart : new Date(Date.now() + 42 * 864e5).toISOString().slice(0, 10));
    const assumedDate = !wanted;
    const returnDate = input.returnDate && input.returnDate > departureDate ? input.returnDate : undefined;

    const key = `flights:${input.from}:${input.to}:${departureDate}:${returnDate ?? ""}:${input.adults ?? 1}`;
    const result = await cached(key, 10 * 60_000, async () => ({
      offers: await searchFlights({ origin: input.from, destination: input.to, departureDate, returnDate, adults: input.adults }, request.signal),
      retrievedAt: new Date().toISOString(),
    }));

    return NextResponse.json({
      offers: result.offers,
      departureDate,
      returnDate: returnDate ?? null,
      assumedDate,
      freshness: { provider: "duffel", retrievedAt: result.retrievedAt, cacheTtlSeconds: 600 },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid flight request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Flight search is unavailable right now");
  }
}
