import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { transit } from "@/packages/providers/google-places/transit";
import { cached } from "@/lib/server/ttl-cache";
import { localToUtc } from "@/lib/server/timezone";

const place = z.union([z.tuple([z.number(), z.number()]), z.string().min(1)]);
/** A time as the traveller typed it: a day and a clock time at the place they start from. */
const when = z.object({ kind: z.enum(["depart", "arrive"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), at: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) });
const inputSchema = z
  .object({ origin: place, destination: place, departureTime: z.string().datetime().optional(), arrivalTime: z.string().datetime().optional(), when: when.optional() })
  .refine((value) => !(value.departureTime && value.arrivalTime));

export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    await requireTripMember((await params).tripId, { limit: LIMITS.provider });
    if (!process.env.GOOGLE_MAPS_API_KEY) return NextResponse.json({ error: "Transit search is not configured" }, { status: 503 });
    const { when: asked, ...input } = inputSchema.parse(await request.json());
    // "9:00" means 9:00 where the journey starts, which is not the server's or the browser's clock.
    let timeIgnored = false;
    if (asked) {
      const at = await localToUtc(asked.date, asked.time, asked.at, request.signal);
      // A moment that has passed cannot be searched, and neither can one we could not place: search for now and say so.
      if (at && Date.parse(at) > Date.now() + 60_000) input[asked.kind === "depart" ? "departureTime" : "arrivalTime"] = at;
      else timeIgnored = true;
    }
    const key = `transit:${JSON.stringify(input)}`;
    const result = await cached(key, 30_000, async () => ({ routes: await transit(input, request.signal), retrievedAt: new Date().toISOString() }));
    return NextResponse.json({ routes: result.routes, ...(timeIgnored ? { timeIgnored } : {}), freshness: { provider: "google-routes", retrievedAt: result.retrievedAt, cacheTtlSeconds: 30 } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid transit request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Transit is unavailable right now");
  }
});
