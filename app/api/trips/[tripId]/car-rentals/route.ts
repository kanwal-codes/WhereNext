import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { cached } from "@/lib/server/ttl-cache";

/** Rental car locations near a point — name, address, phone, website. Directory only, no pricing/booking. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    await requireTripMember((await params).tripId);
    if (!process.env.GOOGLE_MAPS_API_KEY) return NextResponse.json({ error: "Car rental search is not configured" }, { status: 503 });
    const url = new URL(request.url);
    const inputSchema = z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusMeters: z.number().int().min(500).max(50_000).optional(),
    });
    const input = inputSchema.parse({
      lat: Number(url.searchParams.get("lat")),
      lng: Number(url.searchParams.get("lng")),
      radiusMeters: url.searchParams.get("radius") ? Number(url.searchParams.get("radius")) : undefined,
    });

    const key = `car-rentals:${input.lat.toFixed(3)},${input.lng.toFixed(3)}:${input.radiusMeters ?? 15_000}`;
    const result = await cached(key, 24 * 60 * 60_000, async () => ({
      businesses: await new GooglePlacesProvider().nearby("car_rental", { lat: input.lat, lng: input.lng }, input.radiusMeters, request.signal),
      retrievedAt: new Date().toISOString(),
    }));
    return NextResponse.json({ businesses: result.businesses, freshness: { provider: "google-places", retrievedAt: result.retrievedAt, cacheTtlSeconds: 86_400 } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Car rental search is unavailable right now");
  }
}
