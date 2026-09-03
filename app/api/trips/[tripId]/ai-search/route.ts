import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { DISCOVER_CATEGORY_KEYS, parseAiSearch, type AiSearchScope } from "@/lib/application/ai-search";
import { cached } from "@/lib/server/ttl-cache";

const bodySchema = z.object({
  scope: z.enum(["stays", "discover", "getting-around"]),
  query: z.string().trim().min(1).max(400),
});

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const { scope, query } = bodySchema.parse(await request.json());

    const trip = await createTripRepository(supabase).get(tripId);
    const ctx = {
      destination: trip?.destination ?? undefined,
      origin: trip?.origin ?? undefined,
      categories: scope === "discover" ? [...DISCOVER_CATEGORY_KEYS] : undefined,
    };

    const directive = await cached(
      `ai-search:${scope}:${ctx.destination ?? ""}:${query.toLowerCase()}`,
      24 * 60 * 60_000,
      () => parseAiSearch(scope as AiSearchScope, query, ctx, request.signal),
    );
    return NextResponse.json({ directive });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid search" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Search assistant is unavailable right now");
  }
}
