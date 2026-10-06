import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { fail } from "@/lib/server/with-route";
import { planLeg } from "@/lib/server/plan-leg";
import type { RouteLeg } from "@/packages/contracts/route-plan";

const stop = z.object({ id: z.string().max(80), name: z.string().max(160), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const inputSchema = z.object({ stops: z.array(stop).min(2).max(10) });

/** How to get from each place to the next, for a list of places that may not be saved to the itinerary (a day Roam is proposing in chat). Same planner as the saved-itinerary route plan, without any saved choices. */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    await requireTripMember((await params).tripId, { limit: LIMITS.routes });
    const { stops } = inputSchema.parse(await request.json());
    const legs: RouteLeg[] = await Promise.all(stops.slice(0, -1).map((from, i) => planLeg(from, stops[i + 1], undefined, request.signal)));
    return NextResponse.json({ legs });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid stops" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Routes between these places are unavailable right now");
  }
}
