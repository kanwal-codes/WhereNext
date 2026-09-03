import { NextResponse } from "next/server";
import { aiRequestSchema, compactAiMessages } from "@/packages/contracts/ai-request";
import { assistantSystemPrompt, type AssistantBlock, type AssistantTurnMeta, type PlaceCard } from "@/packages/contracts/assistant";
import { createAiGateway } from "@/packages/ai/gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail, withRoute } from "@/lib/server/with-route";
import { logger } from "@/lib/server/logger";
import { costUsd, estimateTokens } from "@/lib/ai/pricing";
import { loadTripContext, serializeTripContext, formatTripMemory } from "@/lib/application/trip-context";
import { resolveTurn, type ResolvedTurn } from "@/lib/application/turn-resolver";
import { retrieveEvidence } from "@/lib/application/retrieve";
import { resolveCurrency } from "@/lib/currency";
import { refreshThreadSummary } from "@/lib/application/thread-summary";
import { nearest } from "@/lib/application/geo";
import { feasibilityHint } from "@/lib/application/feasibility";
import { buildEssentialsChecklist } from "@/lib/application/essentials";
import { buildComparison } from "@/lib/application/comparison";
import { persistedAssistantStream } from "@/features/conversation/application/persistedAssistantStream";
import { createConversationRepository } from "@/features/conversation/infrastructure/conversationRepository";
import { sanitizeAssistantContent } from "@/lib/application/sanitize-assistant";
import { withTripAiStream } from "@/lib/server/trip-ai-queue";

const SSE_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" };
const PLACE_INTENTS = new Set(["discovery", "nightlife", "food", "activities", "history_culture", "stays", "compare"]);

function cannedStream(content: string) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

function surfaceForIntent(intent: ResolvedTurn["intent"]): AssistantTurnMeta["surface"] {
  if (["discovery", "nightlife", "food", "activities", "history_culture", "compare"].includes(intent)) return "explore";
  if (intent === "stays") return "stay";
  if (intent === "transport") return "transport";
  if (intent === "weather" || intent === "essentials") return "essentials";
  return "chat";
}

function readStrList(preferences: Record<string, unknown>, key: string): string[] {
  const raw = preferences[key];
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}
const readDislikes = (preferences: Record<string, unknown>): string[] => readStrList(preferences, "dislikes");

/** True when this suggestion key already has a confirmed value on the trip. */
function factAlreadyConfirmed(key: string, ctx: Awaited<ReturnType<typeof loadTripContext>>): boolean {
  const p = ctx.preferences;
  const hasList = (v: unknown) => Array.isArray(v) && v.length > 0;
  switch (key) {
    case "budget": return p.budget !== undefined && p.budget !== "";
    case "group": return typeof p.groupType === "string" && p.groupType !== "";
    case "pace": return typeof p.pace === "string" && p.pace !== "";
    case "interests": return hasList(p.interests) || hasList(p.likes);
    case "occasion": return typeof p.occasion === "string" && p.occasion !== "";
    case "dates": return Boolean(ctx.trip?.start_date && ctx.trip?.end_date) || (typeof p.dates === "string" && p.dates !== "");
    case "arrival": return typeof p.arrival === "string" && p.arrival !== "";
    case "getting_around": return (typeof p.transport === "string" && p.transport !== "") || ctx.decisions.some((d) => d.kind === "transport");
    case "base_area": return ctx.decisions.some((d) => d.kind === "stay_area");
    default: return false;
  }
}

async function persistSuggestedFacts(
  supabase: SupabaseClient,
  tripId: string,
  facts: ResolvedTurn["suggestedFacts"],
  ctx: Awaited<ReturnType<typeof loadTripContext>>,
): Promise<void> {
  const rows = (facts ?? [])
    .filter((fact) => !factAlreadyConfirmed(fact.key, ctx))
    .map((fact) => ({
      trip_id: tripId,
      kind: "suggestion",
      value: {
        key: fact.key,
        display: fact.display,
        rationale: fact.rationale,
        ...(fact.key === "dates" && fact.startDate && fact.endDate ? { startDate: fact.startDate, endDate: fact.endDate } : {}),
      },
      source: "assistant",
      idempotency_key: `sugg:${fact.key}`,
    }));
  if (rows.length === 0) return;
  try {
    await supabase.from("trip_decisions").upsert(rows, { onConflict: "trip_id,idempotency_key" });
  } catch {
    // A missed suggestion is not worth failing the turn (or a test with a partial supabase mock).
  }
}

export const POST = withRoute(async function POST(request: Request) {
  const parsed = aiRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid AI request" }, { status: 400 });
  const { tripId } = parsed.data;

  let supabase: SupabaseClient;
  try {
    ({ supabase } = await requireTripMember(tripId));
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Assistant unavailable");
  }

  try {
    // Context, thread summary and the stored transcript are independent — one round-trip.
    const [tripCtx, threadRow, storedMessages] = await Promise.all([
      loadTripContext(supabase, tripId),
      supabase.from("conversation_threads").select("summary").eq("trip_id", tripId).maybeSingle(),
      createConversationRepository(supabase).list(tripId),
    ]);
    const context = serializeTripContext(tripCtx);
    const destination = tripCtx.trip?.destination ?? "the trip destination";
    const threadSummary = (threadRow.data?.summary as string | null) ?? "";
    const tripSummary = [formatTripMemory(tripCtx), threadSummary && `Earlier in this conversation: ${threadSummary}`].filter(Boolean).join(" ");
    const prompt = parsed.data.messages.at(-1)?.content ?? "";
    const idempotencyKey = `assistant:${parsed.data.messageIdempotencyKey}`;

    const modelMessages = storedMessages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map(({ role, content }) => ({ role: role as "user" | "assistant", content }));
    const persistedPrompt = storedMessages.some(
      (message) => message.role === "user" && message.idempotency_key === `user:${parsed.data.messageIdempotencyKey}` && message.content === prompt,
    );
    if (!persistedPrompt) return NextResponse.json({ error: "Persist the user message before requesting an assistant response" }, { status: 409 });
    void refreshThreadSummary(supabase, tripId, modelMessages, request.signal);

    const dislikes = readDislikes(tripCtx.preferences);

    // Per-turn trace timing + token accounting (COMPOSE usage arrives late, via the stream sniffer).
    const t0 = performance.now();
    const latencyMs: { resolve?: number; retrieve?: number; compose?: number; total?: number } = {};
    let tokensIn = 0;
    let tokensOut = 0;

    // --- RESOLVE ---------------------------------------------------------------
    const resolved = await resolveTurn({ message: prompt, history: modelMessages, tripSummary, signal: request.signal });
    latencyMs.resolve = Math.round(performance.now() - t0);
    logger.debug({ resolved }, "resolve");
    const language = resolved.language;
    const locationFocus = resolved.locationFocus ?? destination;

    // --- CLARIFY -------------------------------------------------------------
    if (resolved.clarify) {
      const meta: AssistantTurnMeta = {
        language,
        locationFocus: resolved.locationFocus,
        surface: "chat",
        blocks: [{ type: "clarifying_question", question: resolved.clarify.question, chips: resolved.clarify.chips }],
        sources: [],
        suggestedFollowups: resolved.suggestedFollowups,
        unavailableProviders: [],
      };
      return new Response(
        persistedAssistantStream(cannedStream(resolved.clarify.question), supabase, tripId, idempotencyKey, undefined, meta),
        { headers: SSE_HEADERS },
      );
    }

    // --- RETRIEVE ---------------------------------------------------------------
    // Guard against an ambiguous bare place name ("Belém" on a Lisbon trip): qualify
    // it with the trip destination before it reaches a provider.
    const anchor = tripCtx.trip?.destination;
    const qualify = (place: string) =>
      anchor && !place.includes(",") && !place.toLowerCase().includes(anchor.toLowerCase().split(",")[0].trim())
        ? `${place}, ${anchor}`
        : place;
    // The trip's real dates stand in when the model didn't name any.
    const tripStart = tripCtx.trip?.start_date ?? undefined;
    const tripEnd = tripCtx.trip?.end_date ?? undefined;
    const toolPlan = resolved.toolPlan.map((call) =>
      call.tool === "search_places" ? { ...call, location: qualify(call.location) }
        : call.tool === "directions" ? { ...call, from: qualify(call.from), to: qualify(call.to) }
        : call.tool === "stays" ? { ...call, location: qualify(call.location), checkin: call.checkin ?? tripStart, checkout: call.checkout ?? tripEnd }
        : call.tool === "flights" ? { ...call, departureDate: call.departureDate ?? tripStart }
        : call,
    );
    const tRetrieve = performance.now();
    const evidence = await retrieveEvidence(
      toolPlan,
      { dislikes, currency: resolveCurrency(tripCtx.preferences), interests: readStrList(tripCtx.preferences, "interests"), likes: readStrList(tripCtx.preferences, "likes") },
      request.signal,
    );
    latencyMs.retrieve = Math.round(performance.now() - tRetrieve);
    const needsGrounding = toolPlan.length > 0;
    const hasGrounding = evidence.places.length > 0 || evidence.sources.length > 0 || evidence.routes.length > 0 || evidence.events.length > 0 || evidence.flights.length > 0 || evidence.stays.length > 0 || Boolean(evidence.weather);

    if (needsGrounding && !hasGrounding) {
      const fallback = "I couldn't verify anything for this right now — the travel data providers returned nothing. Try again, or narrow it to a specific place or activity.";
      const meta: AssistantTurnMeta = { language, locationFocus: resolved.locationFocus, surface: "chat", blocks: [], sources: [], suggestedFollowups: resolved.suggestedFollowups, unavailableProviders: evidence.unavailableProviders.slice(0, 12) };
      return new Response(
        persistedAssistantStream(cannedStream(fallback), supabase, tripId, idempotencyKey, undefined, meta),
        { headers: SSE_HEADERS },
      );
    }

    const origin = new URL(request.url).origin;
    const photoUrl = (name: string) => `${origin}/api/trips/${tripId}/places/google/photo?name=${encodeURIComponent(name)}`;
    const requestedImages = /\b(photo|photos|image|images|picture|pictures)\b/i.test(prompt);
    // The model must only see the places it will actually get cards for, so its reply can't
    // reference a place with no card. This slice IS the `place_list` block below.
    const cardPlaces = evidence.places.slice(0, 6);
    const compactPlaces = cardPlaces.map((place) => ({
      provider: place.provider, providerId: place.providerId, name: place.name, category: place.category, address: place.address,
      rating: place.rating, userRatingCount: place.userRatingCount, sourceUrl: place.sourceUrl, photoName: place.photoNames?.[0],
    }));
    const compactSources = evidence.sources.map((source) => ({ title: source.title, url: source.url, content: source.content.slice(0, 700) }));
    const compactEvents = evidence.events.slice(0, 8).map((event) => ({ name: event.title, date: event.date, venue: event.venue, url: event.url, via: event.source }));
    const compactFlights = evidence.flights.map((search) => ({
      origin: search.origin, destination: search.destination, departureDate: search.departureDate, exampleDate: search.assumedDate,
      offers: search.offers.map((offer) => ({
        airline: offer.airline, price: `${offer.priceAmount} ${offer.priceCurrency}`,
        hours: +(offer.durationMinutes / 60).toFixed(1), stops: offer.stops, departs: offer.departAt, arrives: offer.arriveAt,
      })),
    }));
    const compactStays = evidence.stays.map((search) => ({
      location: search.location, checkin: search.checkin, checkout: search.checkout, nights: search.nights, exampleDates: search.assumedDates,
      hotels: search.options.map((option) => ({
        name: option.name, nightly: `${option.nightlyAmount} ${option.currency}`, total: `${option.totalAmount} ${option.currency}`,
        stars: option.stars, rating: option.rating, reviews: option.reviewCount, board: option.boardName, refundable: option.refundable,
      })),
      rooms: search.detail ? { hotel: search.detail.hotelName, options: search.detail.rooms.map((room) => ({ name: room.name, nightly: `${room.nightlyAmount} ${room.currency}`, total: `${room.totalAmount} ${room.currency}`, board: room.boardName, refundable: room.refundable })) } : null,
    }));
    const allowedUrls = new Set<string>([
      ...compactSources.map((source) => source.url),
      ...compactEvents.map((event) => event.url),
      ...compactPlaces.flatMap((place) => (place.sourceUrl ? [place.sourceUrl] : [])),
      ...(requestedImages ? compactPlaces.flatMap((place) => (place.photoName ? [photoUrl(place.photoName)] : [])) : []),
    ]);

    const groundingInstruction = hasGrounding
      ? "Use only the evidence below for facts. If a detail is not there, say it is unavailable — do not infer it. If the latest user message names a place different from the trip's stored destination, answer for the newly named place."
      : "You have no fresh provider evidence for this. Answer from the trip context only, or say plainly what you cannot confirm. Do not invent places, prices, or hours.";

    const system = `${assistantSystemPrompt}

${groundingInstruction}

You are talking about: ${locationFocus}.${dislikes.length ? `\nThe traveller dislikes: ${dislikes.join(", ")}. Do not recommend, list, or describe any of these, even if they are famous or in the evidence.` : ""}
Previous messages are context only — never repeat their places, prices, or links unless they also appear in the fresh evidence below.${requestedImages ? "\nThe user asked for photos: include one markdown image per relevant place only if a supplied image URL exists; if none, say verified photos were not returned." : ""}
${feasibilityHint(typeof tripCtx.preferences.pace === "string" ? tripCtx.preferences.pace : undefined, tripCtx.itinerary.map((item) => item.day_index))}
If a recommendation usually sells out or needs timed entry, say so and suggest booking ahead.${(resolved.intent === "weather" || resolved.intent === "essentials" || evidence.weather) ? `\nWeather question: ${evidence.weather ? `a live reading is in the evidence ("${evidence.weather}") — treat it as a forecast only if the trip is within a week, otherwise as the current picture.` : "there is no live forecast (the trip is too far out for one, or the provider was down)."} ${compactSources.length ? "The web sources describe the destination's typical conditions for that month/season — build the answer from them, call it typical/seasonal (not a forecast), and say plainly whether that time of year is hot, mild, cold, wet or dry there." : "If you have nothing on the season either, say the weather is unavailable rather than guessing."} Finish with one concrete packing takeaway (umbrella, layers, sun, warm coat). Never apologise for a missing forecast when you can still describe the season.` : ""}${compactEvents.length ? `\nThe evidence has ${compactEvents.length} dated events, shown as cards. Say which one or two fit the trip's dates and interests and why; do not list titles, dates, venues, or links. Do not invent events.` : ""}${compactFlights.length ? `\nFlight fare estimates are shown as cards. Give a one-line read (cheapest vs fastest, nonstop or not). ${compactFlights.some((search) => search.exampleDate) ? "The travel date is an example — ask for their real dates." : ""} Do not quote fares or list airlines; do not invent routes.` : ""}${compactStays.length ? `\nHotel rates for ${compactStays[0].nights} night(s) are shown as cards. Say which one or two fit the budget, group, and locked places and why.${compactStays.some((search) => search.rooms) ? " Room-level rates for the hotel the user asked about are also shown; say which room type fits the group." : ""} ${compactStays.some((search) => search.exampleDates) ? "The check-in/out dates are an example — ask for their real dates." : ""} Do not list hotels or prices; do not invent any.` : ""}

Trip so far: ${tripSummary}

Authorized trip context (JSON):
${context}

Fresh evidence (retrieved ${evidence.retrievedAt}; unavailable providers: ${evidence.unavailableProviders.join(", ") || "none"}):
${JSON.stringify({
      places: compactPlaces,
      sources: compactSources,
      events: compactEvents,
      flights: compactFlights,
      stays: compactStays,
      weather: evidence.weather,
      routes: evidence.routes.map((route) => ({ from: route.from, to: route.to, mode: route.mode, minutes: Math.round(route.durationSeconds / 60), km: +(route.distanceMeters / 1000).toFixed(1), steps: route.steps })),
      images: requestedImages ? compactPlaces.flatMap((place) => (place.photoName ? [{ place: place.name, url: photoUrl(place.photoName) }] : [])) : [],
    })}`;

    // Side builders start now and overlap with the queue slot + model TTFB; awaited when meta is assembled.
    const checklistPromise = resolved.intent === "essentials"
      ? buildEssentialsChecklist({ destination: locationFocus, tripSummary, evidence, signal: request.signal })
      : Promise.resolve(null);
    const comparisonPromise = resolved.wantsComparison
      ? buildComparison({ prompt, tripSummary, evidence, signal: request.signal })
      : Promise.resolve(null);

    // --- COMPOSE -------------------------------------------------------------
    const tCompose = performance.now();
    const stream = await withTripAiStream(tripId, () => createAiGateway().stream(
      [{ role: "system", content: system }, ...compactAiMessages(modelMessages, 12, 12_000)],
      request.signal,
      (u) => { tokensIn += u.promptTokens; tokensOut += u.completionTokens; },
    ));

    // --- STRUCTURE (assembled from evidence + resolver, not model JSON) ------
    const blocks: AssistantBlock[] = [];
    const distanceToLocked = (place: { latitude: number; longitude: number }): string | undefined => {
      if (tripCtx.lockedPlaces.length === 0) return undefined;
      const hit = nearest({ latitude: place.latitude, longitude: place.longitude }, tripCtx.lockedPlaces);
      return hit ? `${hit.km < 1 ? `${Math.round(hit.km * 1000)} m` : `${hit.km.toFixed(1)} km`} from ${hit.target.title}` : undefined;
    };
    if (cardPlaces.length > 0 && PLACE_INTENTS.has(resolved.intent)) {
      blocks.push({
        type: "place_list",
        places: cardPlaces.map((place): PlaceCard => ({
          provider: place.provider, providerId: place.providerId, name: place.name, category: place.category,
          latitude: place.latitude, longitude: place.longitude, address: place.address,
          rating: place.rating, userRatingCount: place.userRatingCount, priceLevel: place.priceLevel,
          sourceUrl: place.sourceUrl, photoNames: place.photoNames,
          photoUrl: place.photoNames?.[0] ? photoUrl(place.photoNames[0]) : undefined,
          distanceToLocked: distanceToLocked(place),
          trust: "sourced",
        })),
      });
    }
    for (const route of evidence.routes.slice(0, 3)) {
      blocks.push({
        type: "route_summary",
        from: route.from, to: route.to, mode: route.mode,
        durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters,
        steps: route.steps.slice(0, 12), departureTime: route.departureTime, arrivalTime: route.arrivalTime,
        retrievedAt: evidence.retrievedAt,
      });
    }
    if (evidence.events.length > 0) {
      blocks.push({
        type: "events",
        retrievedAt: evidence.retrievedAt,
        items: evidence.events.slice(0, 8).map((event) => ({ title: event.title, url: event.url, date: event.date, venue: event.venue, source: event.source })),
      });
    }
    for (const search of evidence.flights) {
      if (search.offers.length === 0) continue;
      blocks.push({
        type: "flights",
        retrievedAt: evidence.retrievedAt,
        origin: search.origin.slice(0, 80),
        destination: search.destination.slice(0, 80),
        dateNote: search.assumedDate ? `Example date ${search.departureDate} — no travel date set yet` : `Departing ${search.departureDate}`,
        items: search.offers.slice(0, 8).map((offer) => ({
          airline: offer.airline.slice(0, 80),
          price: offer.priceAmount.slice(0, 20),
          currency: offer.priceCurrency.slice(0, 8),
          durationMinutes: offer.durationMinutes,
          stops: offer.stops,
          departAt: offer.departAt.slice(0, 40),
          arriveAt: offer.arriveAt.slice(0, 40),
        })),
      });
    }
    for (const search of evidence.stays) {
      if (search.options.length === 0) continue;
      blocks.push({
        type: "stays",
        retrievedAt: evidence.retrievedAt,
        location: search.location.slice(0, 120),
        checkin: search.checkin,
        checkout: search.checkout,
        nights: search.nights,
        dateNote: search.assumedDates ? `Example dates ${search.checkin} → ${search.checkout} — set your real dates` : `${search.checkin} → ${search.checkout}`,
        detailHotel: search.detail?.hotelName,
        items: search.options.slice(0, 6).map((option) => ({
          hotelId: option.hotelId.slice(0, 120),
          name: option.name.slice(0, 160),
          nightlyPrice: String(option.nightlyAmount),
          totalPrice: String(option.totalAmount),
          currency: option.currency.slice(0, 8),
          stars: option.stars ?? undefined,
          rating: option.rating ?? undefined,
          reviews: option.reviewCount ?? undefined,
          board: option.boardName ?? undefined,
          refundable: option.refundable,
          distanceToLocked: option.latitude != null && option.longitude != null ? distanceToLocked({ latitude: option.latitude, longitude: option.longitude }) : undefined,
          thumbnailUrl: option.thumbnail?.startsWith("http") ? option.thumbnail : undefined,
          latitude: option.latitude ?? undefined,
          longitude: option.longitude ?? undefined,
          address: option.address?.slice(0, 200) ?? undefined,
          city: option.city?.slice(0, 80) ?? undefined,
        })),
        rooms: search.detail?.rooms.slice(0, 12).map((room) => ({
          name: room.name.slice(0, 120),
          boardName: room.boardName,
          refundable: room.refundable,
          maxOccupancy: room.maxOccupancy,
          nightlyAmount: room.nightlyAmount,
          totalAmount: room.totalAmount,
          currency: room.currency.slice(0, 8),
        })),
      });
    }
    const [checklist, comparison] = await Promise.all([checklistPromise, comparisonPromise]);
    if (checklist) blocks.push(checklist);
    if (comparison) {
      // When we're comparing real places, carry their ids so the chat can open a live side-by-side.
      const placeIds = cardPlaces.map((p) => p.providerId).filter(Boolean);
      blocks.push(placeIds.length >= 2 ? ({ ...comparison, placeIds: placeIds.slice(0, 4) } as AssistantBlock) : comparison);
    }
    if (resolved.suggestedFollowups.length > 0) blocks.push({ type: "actions", items: resolved.suggestedFollowups });

    // Store any trip facts the resolver inferred as pending "suggestions" (one live row per key),
    // skipping keys the trip has already confirmed. The trip-context panel surfaces them to confirm.
    void persistSuggestedFacts(supabase, tripId, resolved.suggestedFacts, tripCtx);

    const proposedCommand = resolved.proposedProfileUpdate && Object.keys(resolved.proposedProfileUpdate).length > 0
      ? { type: "update_preferences" as const, tripId, preferences: resolved.proposedProfileUpdate }
      : undefined;

    const meta: AssistantTurnMeta = {
      language,
      locationFocus,
      surface: surfaceForIntent(resolved.intent),
      blocks,
      sources: compactSources.map((source) => ({ title: source.title, url: source.url, retrievedAt: evidence.retrievedAt, trust: "sourced" as const })),
      suggestedFollowups: resolved.suggestedFollowups,
      proposedCommand,
      // A far-future trip can't have a live forecast — if we answered the weather from seasonal
      // web sources, don't also tell the user we "could not check weather".
      unavailableProviders: ((resolved.intent === "weather" || resolved.intent === "essentials") && compactSources.length > 0
        ? evidence.unavailableProviders.filter((provider) => provider !== "openweather")
        : evidence.unavailableProviders
      ).slice(0, 12),
    };

    return new Response(
      persistedAssistantStream(stream, supabase, tripId, idempotencyKey, (content) => sanitizeAssistantContent(content, allowedUrls), meta, (finalText) => {
        latencyMs.compose = Math.round(performance.now() - tCompose);
        latencyMs.total = Math.round(performance.now() - t0);
        // A local fake / Cerebras may not report usage — fall back to a char/4 estimate.
        if (!tokensIn) tokensIn = estimateTokens(system);
        if (!tokensOut) tokensOut = estimateTokens(finalText);
        logger.info(
          {
            ai: {
              intent: resolved.intent,
              toolPlan: toolPlan.map((t) => t.tool),
              providersFailed: evidence.unavailableProviders,
              blocks: blocks.map((b) => b.type),
              tokensIn,
              tokensOut,
              costUsd: Number(costUsd(process.env.AI_MODEL, tokensIn, tokensOut).toFixed(5)),
              latencyMs,
            },
          },
          "ai turn",
        );
      }),
      { headers: SSE_HEADERS },
    );
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 503;
    return NextResponse.json(
      { error: status === 429 ? "The assistant is busy right now. Try again in a moment." : "The assistant is unavailable right now." },
      { status, headers: status === 429 ? { "retry-after": "10" } : undefined },
    );
  }
});
