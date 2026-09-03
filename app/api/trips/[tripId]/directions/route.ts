import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { route } from "@/packages/providers/mapbox/client";
import { cached } from "@/lib/server/ttl-cache";

const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const inputSchema = z.object({ origin: coordinate, destination: coordinate, profile: z.enum(["driving", "walking", "cycling"]).default("walking") });

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    await requireTripMember((await params).tripId);
    if (!process.env.MAPBOX_ACCESS_TOKEN) return NextResponse.json({ error: "Directions are not configured" }, { status: 503 });
    const input = inputSchema.parse(await request.json());
    const key = `directions:${JSON.stringify(input)}`;
    const result = await cached(key, 60_000, async () => ({ route: await route(input, request.signal), retrievedAt: new Date().toISOString() }));
    return NextResponse.json({ route: result.route, freshness: { provider: "mapbox", retrievedAt: result.retrievedAt, cacheTtlSeconds: 60 } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid directions request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Directions are unavailable right now");
  }
}
