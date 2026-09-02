import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { transit } from "@/packages/providers/google-places/transit";
import { cached } from "@/lib/server/ttl-cache";

const place = z.union([z.tuple([z.number(), z.number()]), z.string().min(1)]);
const inputSchema = z
  .object({ origin: place, destination: place, departureTime: z.string().datetime().optional(), arrivalTime: z.string().datetime().optional() })
  .refine((value) => !(value.departureTime && value.arrivalTime));

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    await requireTripMember((await params).tripId);
    if (!process.env.GOOGLE_MAPS_API_KEY) return NextResponse.json({ error: "Transit search is not configured" }, { status: 503 });
    const input = inputSchema.parse(await request.json());
    const key = `transit:${JSON.stringify(input)}`;
    const result = await cached(key, 30_000, async () => ({ routes: await transit(input, request.signal), retrievedAt: new Date().toISOString() }));
    return NextResponse.json({ routes: result.routes, freshness: { provider: "google-routes", retrievedAt: result.retrievedAt, cacheTtlSeconds: 30 } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid transit request" }, { status: 400 });
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Transit is unavailable right now" }, { status: 503 });
  }
}
