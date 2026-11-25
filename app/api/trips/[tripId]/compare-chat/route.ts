import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { loadTripContext, serializeTripContext, asList } from "@/lib/application/trip-context";
import { generateText } from "@/packages/ai/model-policy";
import { haversineKm } from "@/lib/application/geo";
import { dislikesInstruction } from "@/packages/contracts/assistant";
import { finalizeAssistantText } from "@/lib/application/evaluator";
import { withRoute } from "@/lib/server/with-route";
import { listingAnswerRules, listingChatBodySchema as bodySchema, listingLine } from "@/lib/application/listing-chat";

/**
 * A throwaway comparison conversation. It has the full trip context (so it can reason
 * about budget, pace, and how far each option is from where you're staying) but it
 * writes nothing — the messages live only in the client until the page reloads.
 */

export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { limit: LIMITS.llm });
    const { items, messages } = bodySchema.parse(await request.json());

    const context = await loadTripContext(supabase, tripId);
    const stay = context.lockedStay;
    const anchor = stay && stay.latitude != null && stay.longitude != null ? { name: stay.hotelName, lat: stay.latitude, lng: stay.longitude } : null;
    const dislikes = asList(context.preferences.dislikes);
    const accessibilityNeeds = asList(context.preferences.accessibilityNeeds);

    const itemLines = items.map((it, i) => {
      const dist = anchor && it.lat != null && it.lng != null
        ? ` (~${haversineKm({ latitude: anchor.lat, longitude: anchor.lng }, { latitude: it.lat, longitude: it.lng }).toFixed(1)} km straight-line from ${anchor.name})`
        : "";
      return listingLine(it, i, dist);
    });

    // A single thing on screen: which planned stops are near it, so "it would fit on day 1" is a fact with a distance, not a guess.
    const only = items.length === 1 ? items[0]! : null;
    const nearPlanned = only && only.lat != null && only.lng != null
      ? (context.itinerary ?? [])
          .filter((stop) => stop.latitude != null && stop.longitude != null && stop.title.trim().toLowerCase() !== only.name.trim().toLowerCase())
          .map((stop) => ({ stop, km: haversineKm({ latitude: only.lat!, longitude: only.lng! }, { latitude: stop.latitude!, longitude: stop.longitude! }) }))
          .filter(({ km }) => km <= 15)
          .sort((a, b) => a.km - b.km)
          .slice(0, 3)
          .map(({ stop, km }) => `${stop.title} (day ${stop.day_index}, ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} straight-line)`)
      : [];
    if (nearPlanned.length) itemLines.push(`Near what is already planned: ${nearPlanned.join("; ")}.`);

    // Shares the same grounding/dislikes/accessibility/language rules the main chat pipeline
    // applies — this is the same comparison feature, reached from a different surface, and a
    // stated dislike or accessibility need must be respected here too, not only in chat.
    const system = [
      items.length === 1
        ? "You are the traveller's trip assistant. They have one thing open on screen (a place, a hotel, an event, a flight) and are asking about it."
        : "You are the traveller's trip assistant, helping them compare a short list of options they picked on screen.",
      "Reply in the language of the traveller's latest message.",
      listingAnswerRules(items.length === 1, true),
      anchor ? `They're staying at ${anchor.name}; the straight-line distances below are rough — if asked about real travel time, give a sensible range and say it depends on transit, never invent exact minutes.` : "No accommodation is locked yet, so you can't judge distance from a base.",
      dislikesInstruction(dislikes),
      accessibilityNeeds.length ? `Accessibility requirement (hard constraint): ${accessibilityNeeds.join(", ")}. If an option's accessibility isn't confirmed by the details given, say so rather than assuming it fits.` : "",
      "Never state a price, rating, or fact that isn't in the options list below.",
      "",
      `Trip context (JSON): ${serializeTripContext(context)}`,
      "",
      items.length === 1 ? "What is open on screen:" : "Options being compared:",
      ...itemLines,
    ].filter(Boolean).join("\n");

    // Not streamed: this is 2-4 sentences, and a real streamed response gives no clean way to
    // fail over mid-stream if a provider stalls (content already sent to the client can't be
    // un-sent). One buffered call is fully covered by the fallback chain's own timeout+retry —
    // it either fully succeeds or fully fails, with no partial-answer state in between.
    const text = await generateText(
      "compose",
      [{ role: "system", content: system }, ...messages],
      request.signal,
    );

    // Phase 5 (docs/overhaul/roadmap/phase-5-optional-improvements.md) — compare-chat
    // convergence, option (b): the same sanitizer + grounding-evaluator pass COMPOSE's main
    // pipeline runs every reply through (Phase 3, lib/application/evaluator.ts). Before this,
    // compare-chat's own "never state a fact not in the options list" prompt instruction had no
    // safety net at all — the exact gap the evaluator-optimizer pattern was built to close for
    // the main chat. `itemLines` (the options list actually shown to the model) is the grounding
    // text; no links are ever offered here, so the allow-list is empty.
    const finalized = await finalizeAssistantText(text, new Set(), itemLines.join("\n"), request.signal);

    return new Response(finalized, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return new Response(JSON.stringify({ error: "Invalid compare request" }), { status: 400, headers: { "content-type": "application/json" } });
    return tripAuthResponse(error) ?? new Response(JSON.stringify({ error: "The comparison assistant is unavailable right now" }), { status: 503, headers: { "content-type": "application/json" } });
  }
});
