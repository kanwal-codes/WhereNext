import { NextResponse } from "next/server";
import { streamText, stepCountIs } from "ai";
import { createReasoningGate } from "@/lib/ai/strip-reasoning";
import { aiRequestSchema, compactAiMessages } from "@/packages/contracts/ai-request";
import { assistantSystemPrompt, type AssistantBlock, type AssistantTurnMeta, type PlaceCard } from "@/packages/contracts/assistant";
import { composeModelChain } from "@/packages/ai/compose-model";
import { buildComposeTools } from "@/packages/ai/compose-tools";
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
import { recordAiTurn } from "@/lib/server/ai-turn-trace";

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
    const viewContext = parsed.data.viewContext;
    const idempotencyKey = `assistant:${parsed.data.messageIdempotencyKey}`;

    const modelMessages = storedMessages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map(({ role, content }) => ({ role: role as "user" | "assistant", content }));

    // Places (and hotels) already shown as cards earlier in this thread — so COMPOSE doesn't
    // re-list them turn after turn. Derived from the persisted block metadata; no extra query.
    const surfacedEarlier = new Set<string>();
    for (const message of storedMessages) {
      const blocks = (message.metadata as { blocks?: AssistantBlock[] } | null)?.blocks;
      for (const block of blocks ?? []) {
        if (block.type === "place_list") for (const place of block.places) surfacedEarlier.add(place.name);
        else if (block.type === "stays") for (const hotel of block.items) surfacedEarlier.add(hotel.name);
      }
    }

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
    const resolved = await resolveTurn({ message: prompt, history: modelMessages, tripSummary, viewContext, signal: request.signal });
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
    const rejectedNames = tripCtx.places
      .filter((entry) => entry.status === "rejected" && entry.place?.name)
      .map((entry) => entry.place!.name);
    const retrieveFilters = { dislikes, currency: resolveCurrency(tripCtx.preferences), interests: readStrList(tripCtx.preferences, "interests"), likes: readStrList(tripCtx.preferences, "likes"), tripStart: tripCtx.trip?.start_date, tripEnd: tripCtx.trip?.end_date, excludeNames: rejectedNames };
    const grounded = (result: Awaited<ReturnType<typeof retrieveEvidence>>) =>
      result.places.length > 0 || result.sources.length > 0 || result.routes.length > 0 || result.events.length > 0 || result.flights.length > 0 || result.stays.length > 0 || Boolean(result.weather);

    const tRetrieve = performance.now();
    let evidence = await retrieveEvidence(toolPlan, retrieveFilters, request.signal);
    const needsGrounding = toolPlan.length > 0;

    // Nothing came back for a plan that needed grounding — before giving up, retry once with a
    // broader query (generic term, trip destination as the location). Catches an over-specific
    // resolver plan or a place name the provider didn't recognise.
    if (needsGrounding && !grounded(evidence)) {
      const generic: Record<string, string> = { food: "restaurants", nightlife: "bars", activities: "things to do", history_culture: "landmarks and museums" };
      const broadened = toolPlan.map((call) =>
        call.tool === "search_places" ? { ...call, query: generic[resolved.intent] ?? "top attractions", location: anchor ?? call.location }
          : call.tool === "events" ? { ...call, query: "", location: anchor ?? call.location }
          : call.tool === "research_web" ? { ...call, query: `${call.query} ${anchor ?? ""}`.trim() }
          : call,
      );
      const retried = await retrieveEvidence(broadened, retrieveFilters, request.signal);
      if (grounded(retried)) evidence = retried;
    }
    latencyMs.retrieve = Math.round(performance.now() - tRetrieve);
    const hasGrounding = grounded(evidence);

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
    const compactEvents = evidence.events.slice(0, 8).map((event) => ({
      name: event.title, date: event.date, venue: event.venue, url: event.url, via: event.source,
      whenVsTrip: event.relToTrip === "in" ? "during the trip"
        : event.relToTrip === "before" ? `${event.offsetDays}d before the trip`
        : event.relToTrip === "after" ? `${event.offsetDays}d after the trip` : undefined,
      // PredictHQ signal: 0-100 how big for the area, plus predicted turnout.
      pull: typeof event.rank === "number" ? event.rank : undefined,
      expectedCrowd: event.attendance,
    }));
    const eventsInWindow = evidence.events.filter((event) => event.relToTrip === "in");
    const nearestEventMiss = evidence.events
      .filter((event) => event.relToTrip === "before" || event.relToTrip === "after")
      .sort((a, b) => (a.offsetDays ?? 0) - (b.offsetDays ?? 0))[0];
    const eventCall = toolPlan.find((call): call is Extract<typeof call, { tool: "events" }> => call.tool === "events");
    const eventsGuidance = compactEvents.length
      ? [
          "The events shown as cards are the ONLY events you may present as confirmed; never state a date or venue for one that is not a card, and do not restate every title/date/venue/link.",
          eventsInWindow.length
            ? `${eventsInWindow.length} fall during the trip — name the one or two that best fit the traveller's interests and why.${evidence.events.some((e) => typeof e.rank === "number") ? " A `pull` score (0-100) marks how big each one is for the city; call out the standout." : ""}`
            : nearestEventMiss
              ? `NONE fall in the trip window. Lead with the closest: "${nearestEventMiss.title}"${nearestEventMiss.date ? ` on ${nearestEventMiss.date}` : ""}, ${nearestEventMiss.offsetDays} day${nearestEventMiss.offsetDays === 1 ? "" : "s"} ${nearestEventMiss.relToTrip === "before" ? "before the traveller arrives" : "after the traveller leaves"} — do not just say there is nothing on.`
              : "None are on for the trip dates — say so plainly.",
          eventCall?.artist && eventsInWindow.length >= 2
            ? `The traveller asked specifically about "${eventCall.artist}", who plays ${eventsInWindow.length} nights during the trip (${eventsInWindow.map((e) => e.date).filter(Boolean).join(", ")}). List each night and ASK which one they want — do not choose for them.`
            : "",
        ].filter(Boolean).join(" ")
      : compactSources.length
        ? "There are no verified event cards. If a web source clearly names a relevant show you may mention it as \"listed on <source>\" — never assert its date or venue — otherwise say you found no confirmed events for those dates and suggest checking a venue's own calendar closer to the trip."
        : "";
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
You have read-only lookup tools (places, web, weather, events, flights, directions, stays, and the trip's own itinerary/saved places). The evidence below is already retrieved for the plan — only call a tool for something it genuinely does not cover, such as directions between two places you just found, or a second web check. Do not re-fetch what is already below.

You are talking about: ${locationFocus}.${viewContext ? `\nThe user has this open beside the chat: ${viewContext}. Read "there", "this place", "it" as this unless the message names somewhere else.` : ""}${dislikes.length ? `\nThe traveller dislikes: ${dislikes.join(", ")}. Do not recommend, list, or describe any of these, even if they are famous or in the evidence.` : ""}
Previous messages are context only — never repeat their places, prices, or links unless they also appear in the fresh evidence below.${surfacedEarlier.size ? `\nAlready shown as cards earlier in this conversation: ${[...surfacedEarlier].slice(0, 30).join(", ")}. Don't present these again unless one is genuinely the best answer to the current question — and if so, say why it still fits.` : ""}${requestedImages ? "\nThe user asked for photos: include one markdown image per relevant place only if a supplied image URL exists; if none, say verified photos were not returned." : ""}
${feasibilityHint(typeof tripCtx.preferences.pace === "string" ? tripCtx.preferences.pace : undefined, tripCtx.itinerary.map((item) => item.day_index))}
If a recommendation usually sells out or needs timed entry, say so and suggest booking ahead.${(resolved.intent === "weather" || resolved.intent === "essentials" || evidence.weather) ? `\nWeather question: ${evidence.weather ? `a live reading is in the evidence ("${evidence.weather}") — treat it as a forecast only if the trip is within a week, otherwise as the current picture.` : "there is no live forecast (the trip is too far out for one, or the provider was down)."} ${compactSources.length ? "The web sources describe the destination's typical conditions for that month/season — build the answer from them, call it typical/seasonal (not a forecast), and say plainly whether that time of year is hot, mild, cold, wet or dry there." : "If you have nothing on the season either, say the weather is unavailable rather than guessing."} Finish with one concrete packing takeaway (umbrella, layers, sun, warm coat). Never apologise for a missing forecast when you can still describe the season.` : ""}${eventsGuidance ? `\n${eventsGuidance}` : ""}${compactFlights.length ? `\nFlight fare estimates are shown as cards. Give a one-line read (cheapest vs fastest, nonstop or not). ${compactFlights.some((search) => search.exampleDate) ? "The travel date is an example — ask for their real dates." : ""} Do not quote fares or list airlines; do not invent routes.` : ""}${compactStays.length ? `\nHotel rates for ${compactStays[0].nights} night(s) are shown as cards. Say which one or two fit the budget, group, and locked places and why.${compactStays.some((search) => search.rooms) ? " Room-level rates for the hotel the user asked about are also shown; say which room type fits the group." : ""} ${compactStays.some((search) => search.exampleDates) ? "The check-in/out dates are an example — ask for their real dates." : ""} Do not list hotels or prices; do not invent any.` : ""}

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

    // --- COMPOSE (bounded tool-calling loop) --------------------------------
    // RESOLVE's plan is already retrieved above and shown in `system`. The model may call these
    // tools for follow-ups it still needs (directions between two places it just found, a second
    // web lookup); results merge into `toolEvidence` and extend `allowedUrls`. Cards stay
    // assembled server-side from `evidence` (ADR 0002) — tool results inform the prose only.
    const { tools: composeTools, accumulated: toolEvidence } = buildComposeTools({
      filters: retrieveFilters, qualify, tripStart, tripEnd, tripCtx, signal: request.signal, allowedUrls,
    });
    const tCompose = performance.now();
    const composeChain = composeModelChain();
    const stream = await withTripAiStream(tripId, async () => {
      // Try the primary model, then each fallback, until one produces its first chunk. Forcing
      // the first step here also means a provider 4xx/5xx surfaces before the Response, so the
      // route's catch tail can still return a 429/503 rather than an empty stream.
      let iterator: AsyncIterator<string> | undefined;
      let firstChunk: IteratorResult<string> | undefined;
      let lastError: unknown;
      for (let i = 0; i < composeChain.length; i += 1) {
        const entry = composeChain[i];
        const result = streamText({
          model: entry.model,
          system,
          messages: compactAiMessages(modelMessages, 12, 12_000),
          tools: composeTools,
          stopWhen: stepCountIs(4),
          abortSignal: request.signal,
          providerOptions: entry.providerOptions,
          onError: ({ error }) => logger.error({ err: error }, "compose stream error"),
        });
        try {
          const it = result.textStream[Symbol.asyncIterator]();
          firstChunk = await it.next();
          iterator = it;
          void result.totalUsage.then(
            (u) => { tokensIn += u.inputTokens ?? 0; tokensOut += u.outputTokens ?? 0; },
            () => undefined,
          );
          break;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          lastError = error;
          logger.warn({ err: error, attempt: i }, "compose model failed, trying next in chain");
        }
      }
      if (!iterator || !firstChunk) throw lastError ?? new Error("compose produced no model");

      const encoder = new TextEncoder();
      const frame = (delta: string) => encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
      // Hold reasoning-model scratchpad (harmony analysis channel, <think> blocks) back from the
      // live stream — it would otherwise flash on screen before the final settle strips it.
      const gate = createReasoningGate();
      const emit = (controller: ReadableStreamDefaultController<Uint8Array>, raw: string) => {
        const clean = gate(raw);
        if (clean) controller.enqueue(frame(clean));
      };
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            if (!firstChunk.done && firstChunk.value) emit(controller, firstChunk.value);
            for (;;) {
              const chunk = await iterator.next();
              if (chunk.done) break;
              if (chunk.value) emit(controller, chunk.value);
            }
          } catch (error) {
            logger.error({ err: error }, "compose stream ended early");
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
    });

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
      const dateScoped = evidence.events.some((event) => event.relToTrip);
      blocks.push({
        type: "events",
        retrievedAt: evidence.retrievedAt,
        ...(dateScoped && tripCtx.trip?.start_date && tripCtx.trip?.end_date
          ? { window: { start: tripCtx.trip.start_date, end: tripCtx.trip.end_date } }
          : {}),
        items: evidence.events.slice(0, 8).map((event) => ({
          title: event.title, url: event.url, date: event.date, venue: event.venue, source: event.source,
          ...(event.relToTrip ? { relToTrip: event.relToTrip, offsetDays: event.offsetDays } : {}),
          ...(typeof event.rank === "number" ? { rank: Math.round(event.rank) } : {}),
        })),
      });
      // Named act with more than one night inside the trip — offer the dates as pickable chips.
      if (eventCall?.artist && eventsInWindow.length >= 2) {
        blocks.push({
          type: "clarifying_question",
          question: `Which ${eventCall.artist} night?`,
          chips: eventsInWindow
            .map((event) => (event.date ?? "").trim())
            .filter(Boolean)
            .slice(0, 6)
            .map((date) => `${eventCall.artist} · ${date}`.slice(0, 48)),
        });
      }
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
      ...(resolved.degraded ? { degraded: true } : {}),
    };

    return new Response(
      persistedAssistantStream(stream, supabase, tripId, idempotencyKey, (content) => sanitizeAssistantContent(content, allowedUrls), meta, (finalText) => {
        latencyMs.compose = Math.round(performance.now() - tCompose);
        latencyMs.total = Math.round(performance.now() - t0);
        // A local fake / Cerebras may not report usage — fall back to a char/4 estimate.
        if (!tokensIn) tokensIn = estimateTokens(system);
        if (!tokensOut) tokensOut = estimateTokens(finalText);
        const cost = Number(costUsd(process.env.AI_MODEL, tokensIn, tokensOut).toFixed(5));
        // RESOLVE's seed plan plus any tool the model called during COMPOSE.
        const toolsUsed = [...new Set([...toolPlan.map((t) => t.tool), ...toolEvidence.usedTools])];
        const providersFailed = [...new Set([...evidence.unavailableProviders, ...toolEvidence.unavailableProviders])];
        logger.info(
          {
            ai: {
              intent: resolved.intent,
              toolPlan: toolsUsed,
              providersFailed,
              blocks: blocks.map((b) => b.type),
              tokensIn,
              tokensOut,
              costUsd: cost,
              latencyMs,
            },
          },
          "ai turn",
        );
        recordAiTurn(supabase, tripId, {
          intent: resolved.intent,
          tools: toolsUsed,
          providers_failed: providersFailed,
          blocks: blocks.map((b) => b.type),
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: cost,
          resolve_ms: latencyMs.resolve,
          retrieve_ms: latencyMs.retrieve,
          compose_ms: latencyMs.compose,
          total_ms: latencyMs.total,
          model_resolve: process.env.RESOLVE_MODEL || process.env.AI_MODEL || undefined,
          model_compose: process.env.AI_MODEL || undefined,
          degraded: Boolean(resolved.degraded),
        });
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
