import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { fail } from "@/lib/server/with-route";
import { route } from "@/packages/providers/mapbox/client";
import { cached } from "@/lib/server/ttl-cache";
import { fxRate } from "@/lib/server/fx";

const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const inputSchema = z.object({ origin: coordinate, destination: coordinate, profile: z.enum(["driving", "walking", "cycling"]).default("walking"), traffic: z.boolean().optional(), /** Leave at this local time at the start, "2026-10-06T09:00" (driving with traffic). */ departAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(), /** The traveller's currency: the reply says what a US dollar is worth in it, so a rideshare estimate can be shown in it. */ currency: z.string().regex(/^[A-Za-z]{3}$/).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    await requireTripMember((await params).tripId, { limit: LIMITS.provider });
    if (!process.env.MAPBOX_ACCESS_TOKEN) return NextResponse.json({ error: "Directions are not configured" }, { status: 503 });
    const input = inputSchema.parse(await request.json());
    const { currency, ...routeInput } = input;
    const key = `directions:${JSON.stringify(routeInput)}`;
    let timeIgnored = false;
    const result = await cached(key, 60_000, async () => {
      try {
        return { route: await route(routeInput, request.signal), retrievedAt: new Date().toISOString() };
      } catch (error) {
        if (!routeInput.departAt) throw error;
        // A time Mapbox will not plan for (one that has passed): drive for now instead.
        timeIgnored = true;
        const { departAt: _ignored, ...now } = routeInput;
        return { route: await route(now, request.signal), retrievedAt: new Date().toISOString() };
      }
    });
    const usdRate = currency ? await fxRate("USD", currency.toUpperCase(), request.signal) : null;
    return NextResponse.json({ route: result.route, ...(timeIgnored ? { timeIgnored } : {}), ...(currency && usdRate ? { usdRate: { currency: currency.toUpperCase(), rate: usdRate } } : {}), freshness: { provider: "mapbox", retrievedAt: result.retrievedAt, cacheTtlSeconds: 60 } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid directions request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Directions are unavailable right now");
  }
}
