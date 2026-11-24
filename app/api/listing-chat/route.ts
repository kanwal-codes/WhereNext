import { z } from "zod";
import { requireUser, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { generateText } from "@/packages/ai/model-policy";
import { finalizeAssistantText } from "@/lib/application/evaluator";
import { listingAnswerRules, listingChatBodySchema, listingLine } from "@/lib/application/listing-chat";
import { withRoute } from "@/lib/server/with-route";

/**
 * A question about the one listing open on the home page's Eat, Stays or Flights, for someone with no trip. Same reader as the trip's side chat
 * (`/api/trips/[tripId]/compare-chat`), without a trip's plans, budget or stay: it answers from the listing's own facts and writes nothing.
 */
export const POST = withRoute(async (request: Request) => {
  try {
    await requireUser({ limit: LIMITS.llm });
    const { items, messages } = listingChatBodySchema.parse(await request.json());
    const itemLines = items.map((it, i) => listingLine(it, i));
    const system = [
      "You are the traveller's travel assistant. They have one thing open on screen (a restaurant, a hotel or a flight) and are asking about it. No trip is open.",
      "Reply in the language of the traveller's latest message.",
      listingAnswerRules(true, false),
      "Never state a price, rating, or fact that isn't in the details below. If they ask whether it fits their plans or budget, say you don't have those and answer from the listing alone.",
      "",
      "What is open on screen:",
      ...itemLines,
    ].join("\n");
    const text = await generateText("compose", [{ role: "system", content: system }, ...messages], request.signal);
    const finalized = await finalizeAssistantText(text, new Set(), itemLines.join("\n"), request.signal);
    return new Response(finalized, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return new Response(JSON.stringify({ error: "Invalid listing question" }), { status: 400, headers: { "content-type": "application/json" } });
    return tripAuthResponse(error) ?? new Response(JSON.stringify({ error: "The assistant is unavailable right now" }), { status: 503, headers: { "content-type": "application/json" } });
  }
});
