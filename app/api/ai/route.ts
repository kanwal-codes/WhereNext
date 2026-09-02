import { NextResponse } from "next/server";
import { aiRequestSchema, compactAiMessages } from "@/packages/contracts/ai-request";
import { assistantSystemPrompt, type AssistantBlock, type AssistantTurnMeta, type PlaceCard } from "@/packages/contracts/assistant";
import { createAiGateway } from "@/packages/ai/gateway";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTripContext, serializeTripContext, formatTripMemory } from "@/lib/application/trip-context";
import { resolveTurn, type ResolvedTurn } from "@/lib/application/turn-resolver";
import { retrieveEvidence } from "@/lib/application/retrieve";
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

function readDislikes(preferences: Record<string, unknown>): string[] {
  const raw = preferences.dislikes;
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = aiRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid AI request" }, { status: 400 });

  const { tripId } = parsed.data;
  const membership = await supabase.from("trip_members").select("trip_id").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
  if (!membership.data) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  try {
    const [tripCtx, threadRow] = await Promise.all([
      loadTripContext(supabase, tripId),
      supabase.from("conversation_threads").select("summary").eq("trip_id", tripId).maybeSingle(),
    ]);
    const context = serializeTripContext(tripCtx);
    const destination = tripCtx.trip?.destination ?? "the trip destination";
    const threadSummary = (threadRow.data?.summary as string | null) ?? "";
    const tripSummary = [formatTripMemory(tripCtx), threadSummary && `Earlier in this conversation: ${threadSummary}`].filter(Boolean).join(" ");
    const prompt = parsed.data.messages.at(-1)?.content ?? "";
    const idempotencyKey = `assistant:${parsed.data.messageIdempotencyKey}`;

    const storedMessages = await createConversationRepository(supabase).list(tripId);
    const modelMessages = storedMessages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map(({ role, content }) => ({ role: role as "user" | "assistant", content }));
    const persistedPrompt = storedMessages.some(
      (message) => message.role === "user" && message.idempotency_key === `user:${parsed.data.messageIdempotencyKey}` && message.content === prompt,
    );
    if (!persistedPrompt) return NextResponse.json({ error: "Persist the user message before requesting an assistant response" }, { status: 409 });
    void refreshThreadSummary(supabase, tripId, modelMessages, request.signal);

    const dislikes = readDislikes(tripCtx.preferences);

    // --- RESOLVE ---------------------------------------------------------------
    const resolved = await resolveTurn({ message: prompt, history: modelMessages, tripSummary, signal: request.signal });
    if (process.env.AI_DEBUG) console.log("[RESOLVE]", JSON.stringify(resolved));
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
    const toolPlan = resolved.toolPlan.map((call) =>
      call.tool === "search_places" ? { ...call, location: qualify(call.location) }
        : call.tool === "directions" ? { ...call, from: qualify(call.from), to: qualify(call.to) }
        : call.tool === "stays" ? { ...call, location: qualify(call.location) }
        : call,
    );
    const evidence = await retrieveEvidence(toolPlan, { dislikes }, request.signal);
    const needsGrounding = toolPlan.length > 0;
    const hasGrounding = evidence.places.length > 0 || evidence.sources.length > 0 || evidence.routes.length > 0 || evidence.events.length > 0 || evidence.flights.length > 0 || evidence.stays.length > 0 || Boolean(evidence.weather);

    if (needsGrounding && !hasGrounding) {
      const fallback = "I couldn't verify anything for this right now — the travel data providers returned nothing. Try again, or narrow it to a specific place or activity.";
      const meta: AssistantTurnMeta = { language, locationFocus: resolved.locationFocus, surface: "chat", blocks: [], sources: [], suggestedFollowups: resolved.suggestedFollowups };
      return new Response(
        persistedAssistantStream(cannedStream(fallback), supabase, tripId, idempotencyKey, undefined, meta),
        { headers: SSE_HEADERS },
      );
    }

    const origin = new URL(request.url).origin;
    const photoUrl = (name: string) => `${origin}/api/trips/${tripId}/places/google/photo?name=${encodeURIComponent(name)}`;
    const requestedImages = /\b(photo|photos|image|images|picture|pictures)\b/i.test(prompt);
    const compactPlaces = evidence.places.map((place) => ({
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
    const hotelMapUrl = (name: string, city: string | null) =>
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, city].filter(Boolean).join(" "))}`;
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
      ...evidence.stays.flatMap((search) => search.options.map((option) => hotelMapUrl(option.name, option.city))),
    ]);

    const groundingInstruction = hasGrounding
      ? "Use only the evidence below for facts. If a detail is not there, say it is unavailable — do not infer it. If the latest user message names a place different from the trip's stored destination, answer for the newly named place."
      : "You have no fresh provider evidence for this. Answer from the trip context only, or say plainly what you cannot confirm. Do not invent places, prices, or hours.";

    const system = `${assistantSystemPrompt}

${groundingInstruction}

You are talking about: ${locationFocus}.${dislikes.length ? `\nThe traveller dislikes: ${dislikes.join(", ")}. Do not recommend, list, or describe any of these, even if they are famous or in the evidence.` : ""}
Previous messages are context only — never repeat their places, prices, or links unless they also appear in the fresh evidence below.${requestedImages ? "\nThe user asked for photos: include one markdown image per relevant place only if a supplied image URL exists; if none, say verified photos were not returned." : ""}
${feasibilityHint(typeof tripCtx.preferences.pace === "string" ? tripCtx.preferences.pace : undefined, tripCtx.itinerary.map((item) => item.day_index))}
If a recommendation usually sells out or needs timed entry, say so and suggest booking ahead. When the current topic is settled, end with a one-line pointer to the next planning step.${compactEvents.length ? `\nThe evidence has ${compactEvents.length} dated events. List them by name, date, and venue with their ticket link. Say this is a snapshot from ${evidence.retrievedAt} and dates/availability should be confirmed on the ticket page. Do not invent events not in the list.` : ""}${compactFlights.length ? `\nThe evidence has live flight fare estimates as of ${evidence.retrievedAt}. Give a short range or the cheapest option, name the airline, and say prices change and must be booked on the airline or a travel site. ${compactFlights.some((search) => search.exampleDate) ? "The travel date is an example only — say so and ask for their real dates." : ""} Do not invent fares or routes not in the list.` : ""}${compactStays.length ? `\nThe evidence has live hotel rates from LiteAPI as of ${evidence.retrievedAt} for ${compactStays[0].nights} night(s). Name 2-3 options with their nightly rate, and say taxes/fees may be extra and availability must be confirmed at booking. ${compactStays.some((search) => search.exampleDates) ? "The check-in/out dates are an example only — say so and ask for their real dates." : ""}${compactStays.some((search) => search.rooms) ? " Room-level rates for the hotel the user asked about are in evidence.rooms — list them by room name, board, and nightly price." : ""} Do not invent hotels or prices not in the list.` : ""}

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

    // --- COMPOSE -------------------------------------------------------------
    const stream = await withTripAiStream(tripId, () => createAiGateway().stream(
      [{ role: "system", content: system }, ...compactAiMessages(modelMessages, 12, 12_000)],
      request.signal,
    ));

    // --- STRUCTURE (assembled from evidence + resolver, not model JSON) ------
    const blocks: AssistantBlock[] = [];
    const distanceToLocked = (place: { latitude: number; longitude: number }): string | undefined => {
      if (tripCtx.lockedPlaces.length === 0) return undefined;
      const hit = nearest({ latitude: place.latitude, longitude: place.longitude }, tripCtx.lockedPlaces);
      return hit ? `${hit.km < 1 ? `${Math.round(hit.km * 1000)} m` : `${hit.km.toFixed(1)} km`} from ${hit.target.title}` : undefined;
    };
    if (evidence.places.length > 0 && PLACE_INTENTS.has(resolved.intent)) {
      blocks.push({
        type: "place_list",
        places: evidence.places.slice(0, 6).map((place): PlaceCard => ({
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
          mapUrl: hotelMapUrl(option.name, option.city),
          thumbnailUrl: option.thumbnail?.startsWith("http") ? option.thumbnail : undefined,
        })),
        rooms: search.detail?.rooms.map((room) => ({
          name: room.name.slice(0, 120),
          board: room.boardName ?? undefined,
          refundable: room.refundable,
          nightlyPrice: String(room.nightlyAmount),
          totalPrice: String(room.totalAmount),
          currency: room.currency.slice(0, 8),
        })),
      });
    }
    if (resolved.intent === "essentials") {
      const checklist = await buildEssentialsChecklist({ destination: locationFocus, tripSummary, evidence, signal: request.signal });
      if (checklist) blocks.push(checklist);
    }
    if (resolved.wantsComparison) {
      const comparison = await buildComparison({ prompt, tripSummary, evidence, signal: request.signal });
      if (comparison) blocks.push(comparison);
    }
    if (resolved.suggestedFollowups.length > 0) blocks.push({ type: "actions", items: resolved.suggestedFollowups });

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
    };

    return new Response(
      persistedAssistantStream(stream, supabase, tripId, idempotencyKey, (content) => sanitizeAssistantContent(content, allowedUrls), meta),
      { headers: SSE_HEADERS },
    );
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 503;
    return NextResponse.json(
      { error: status === 429 ? "Assistant is rate-limited; please try again shortly." : "Assistant unavailable" },
      { status, headers: status === 429 ? { "retry-after": "10" } : undefined },
    );
  }
}
