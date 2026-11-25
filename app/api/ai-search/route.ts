import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { withRoute, fail } from "@/lib/server/with-route";
import { parseAiSearch } from "@/lib/application/ai-search";
import { cached } from "@/lib/server/ttl-cache";
import { stayTypesHint } from "@/lib/server/stay-provider";
import { localToday } from "@/lib/local-today";

const bodySchema = z.object({
  scope: z.enum(["stays", "eat", "flights"]),
  query: z.string().trim().min(1).max(400),
  /** Where the page is looking (or leaving from) right now. */
  place: z.string().trim().max(80).optional(),
});

/** "Ask in words" for someone with no trip open (Stays, Eat and Flights from the home page). Trips have their own at /api/trips/[tripId]/ai-search. */
export const POST = withRoute(async (request: Request) => {
  try {
    await requireUser({ limit: LIMITS.llm });
    const { scope, query, place } = bodySchema.parse(await request.json());
    const today = localToday(request.headers);
    // The day is in the key: "saturday" and "tomorrow" mean something different tomorrow.
    const directive = await cached(`ai-search:home:${scope}:${today}:${(place ?? "").toLowerCase()}:${query.toLowerCase()}`, 6 * 60 * 60_000, () => parseAiSearch(scope, query, { today, place, stayTypes: scope === "stays" ? stayTypesHint() : undefined }, request.signal));
    return NextResponse.json({ directive });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid search" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Search assistant is unavailable right now");
  }
});
