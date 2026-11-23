import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { DISCOVER_CATEGORY_KEYS, parseAiSearch, type AiSearchScope } from "@/lib/application/ai-search";
import { cached } from "@/lib/server/ttl-cache";
import { stayTypesHint } from "@/lib/server/stay-provider";

const bodySchema = z.object({
  scope: z.enum(["stays", "discover", "getting-around", "flights"]),
  query: z.string().trim().min(1).max(400),
  /** Where the page is looking (or leaving from) right now, when the sentence names no place. */
  place: z.string().trim().max(80).optional(),
  /** Discover only: also write the short answer. */
  answer: z.boolean().optional(),
});

export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { limit: LIMITS.llm });
    const { scope, query, place, answer } = bodySchema.parse(await request.json());
    const today = new Date().toISOString().slice(0, 10);

    const trip = await createTripRepository(supabase).get(tripId);
    const ctx = {
      destination: trip?.destination ?? undefined,
      origin: trip?.origin ?? undefined,
      categories: scope === "discover" ? [...DISCOVER_CATEGORY_KEYS] : undefined,
      stayTypes: scope === "stays" ? stayTypesHint() : undefined,
      today,
      wantAnswer: answer === true,
      // Flights leave from the trip's start unless the page says otherwise; the other pages look where they are looking.
      place: place || (scope === "flights" ? trip?.origin?.split(",")[0]?.trim() || undefined : undefined),
    };

    // `origin` is embedded in the "getting-around" prompt (a "default from" directive), so it
    // has to be part of the key too — otherwise two trips sharing a destination but different
    // starting points can be served each other's cached, origin-specific answer for a day.
    const directive = await cached(
      `ai-search:${scope}:${today}:${ctx.destination ?? ""}:${ctx.origin ?? ""}:${(ctx.place ?? "").toLowerCase()}:${answer ? "a" : ""}:${query.toLowerCase()}`,
      6 * 60 * 60_000,
      () => parseAiSearch(scope as AiSearchScope, query, ctx, request.signal),
    );
    return NextResponse.json({ directive });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid search" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Search assistant is unavailable right now");
  }
});
