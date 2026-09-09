import type { SupabaseClient } from "@supabase/supabase-js";
import { assistantSystemPrompt, type AssistantBlock, type AssistantTurnMeta, type PlaceCard } from "@/packages/contracts/assistant";
import { buildComposeTools } from "@/packages/ai/compose-tools";
import { loadTripContext, serializeTripContext, formatTripMemory, type TripContext } from "@/lib/application/trip-context";
import { resolveTurn, type ResolvedTurn } from "@/lib/application/turn-resolver";
import { retrieveEvidence } from "@/lib/application/retrieve";
import { resolveCurrency } from "@/lib/currency";
import { nearest } from "@/lib/application/geo";
import { feasibilityHint } from "@/lib/application/feasibility";
import { buildEssentialsChecklist } from "@/lib/application/essentials";
import { buildComparison } from "@/lib/application/comparison";
import { buildItineraryPlan } from "@/lib/application/itinerary-plan";
import { buildBudgetBreakdown } from "@/lib/application/budget-plan";
import { buildExploreOptions } from "@/lib/application/explore-options";
import { buildStructuredAnswer } from "@/lib/application/structured-answer";
import { weatherCardFromForecast, weatherCardFromSeasonal, type WeatherCard } from "@/lib/application/weather-card";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { buildTripRowUpdate, withExplicitDestination } from "@/lib/application/trip-update";

/**
 * RESOLVE → RETRIEVE → block-builders → STRUCTURE, factored out of app/api/ai/route.ts so a
 * second caller (the group-chat @Roam route) can run the same turn without duplicating this
 * ~500-line pipeline. Deliberately does NOT own: streaming vs buffering the COMPOSE reply,
 * persisting the turn (each surface has its own message table), or per-surface bookkeeping like
 * thread-summary refresh — those differ per caller and stay in the route that calls this.
 *
 * Checklist/comparison are handed back as still-running promises (see `sideBuilders`) rather than
 * awaited here: in the personal route they're kicked off before COMPOSE so they overlap with the
 * model's TTFT instead of adding to it. `finalizeAssistantBlocks` folds them in once a caller is
 * ready — the buffered group-chat caller can just await them immediately after its own compose call.
 */

const PLACE_INTENTS = new Set(["discovery", "nightlife", "food", "activities", "history_culture", "stays", "compare"]);

export function surfaceForIntent(intent: ResolvedTurn["intent"]): AssistantTurnMeta["surface"] {
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
function factAlreadyConfirmed(key: string, ctx: TripContext): boolean {
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
    case "destination": return Boolean(ctx.trip?.destination);
    case "travelers": return typeof ctx.trip?.travelers === "number" && ctx.trip.travelers > 0;
    case "trip_length": return typeof ctx.trip?.duration_days === "number" && ctx.trip.duration_days > 0;
    default: return false;
  }
}

async function persistSuggestedFacts(
  supabase: SupabaseClient,
  tripId: string,
  facts: ResolvedTurn["suggestedFacts"],
  ctx: TripContext,
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
    const result = await supabase.from("trip_decisions").upsert(rows, { onConflict: "trip_id,idempotency_key" });
    if (!result.error) invalidateWorkspace(tripId);
  } catch {
    // A missed suggestion is not worth failing the turn (or a test with a partial supabase mock).
  }
}

export type AssistantTurnDeps = { supabase: SupabaseClient; tripId: string };

export type AssistantTurnRequest = {
  tripCtx: TripContext;
  prompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  tripSummary: string;
  viewContext?: string;
  /** Place/hotel names already shown as cards earlier in this thread — omit for a thread with none. */
  surfacedEarlier?: Set<string>;
  /** Recompute tripSummary after an explicit trip-fact update reloads tripCtx mid-turn.
   *  Default: plain `formatTripMemory(ctx)` — the group-chat caller has no thread summary to append. */
  deriveTripSummary?: (ctx: TripContext) => string;
  signal?: AbortSignal;
};

type BaseResult = { resolved: ResolvedTurn & { degraded?: boolean; modelUsed?: string }; timings: { resolveMs: number; retrieveMs?: number } };

export type AssistantTurnResult =
  | (BaseResult & { kind: "declined"; content: string; meta: AssistantTurnMeta })
  | (BaseResult & { kind: "clarify"; content: string; meta: AssistantTurnMeta })
  | (BaseResult & { kind: "ungrounded"; content: string; meta: AssistantTurnMeta; toolsUsed: string[]; providersFailed: string[] })
  | (BaseResult & {
      kind: "ready";
      tripCtx: TripContext;
      system: string;
      composeSkipLine: string | null;
      composeTools: ReturnType<typeof buildComposeTools>["tools"];
      toolEvidence: ReturnType<typeof buildComposeTools>["accumulated"];
      meta: AssistantTurnMeta;
      allowedUrls: Set<string>;
      toolPlan: ResolvedTurn["toolPlan"];
      evidenceUnavailableProviders: string[];
      cardPlaceProviderIds: string[];
      sideBuilders: {
        checklistPromise: ReturnType<typeof buildEssentialsChecklist>;
        comparisonPromise: ReturnType<typeof buildComparison>;
      };
    });

export async function runAssistantTurn(deps: AssistantTurnDeps, req: AssistantTurnRequest): Promise<AssistantTurnResult> {
  const { supabase, tripId } = deps;
  let tripCtx = req.tripCtx;
  const { prompt, history, viewContext, signal } = req;
  let tripSummary = req.tripSummary;
  const surfacedEarlier = req.surfacedEarlier ?? new Set<string>();
  const deriveTripSummary = req.deriveTripSummary ?? ((ctx: TripContext) => formatTripMemory(ctx));
  let context = serializeTripContext(tripCtx);
  let destination = tripCtx.trip?.destination ?? "the trip destination";
  const dislikes = readDislikes(tripCtx.preferences);

  const t0 = performance.now();

  // --- RESOLVE ---------------------------------------------------------------
  const resolved = await resolveTurn({ message: prompt, history, tripSummary, viewContext, signal });
  // Persist explicit core trip facts while this request is still active. This keeps the
  // canonical trip row, the cached workspace, and the assistant's same-turn retrieval in sync.
  const tripUpdate = withExplicitDestination(resolved.proposedTripUpdate, prompt, resolved.locationFocus);
  if (tripUpdate && Object.keys(tripUpdate).length > 0) {
    const update = buildTripRowUpdate(tripCtx.trip, tripUpdate);
    if (Object.keys(update).length > 0) {
      const result = await supabase.from("trips").update(update).eq("id", tripId).select("id").single();
      if (result.error) throw result.error;
      invalidateWorkspace(tripId);
      tripCtx = await loadTripContext(supabase, tripId);
      destination = tripCtx.trip?.destination ?? "the trip destination";
      context = serializeTripContext(tripCtx);
      tripSummary = deriveTripSummary(tripCtx);
    }
  }
  // Which structured builders this turn asked for. Dispatch is "for each capability, run its
  // builder" — a new feature is a menu entry + a builder, nothing to wire here.
  const caps = new Set(resolved.capabilities);
  const exploreKind: "area" | "daytrip" | null = caps.has("area_guide") ? "area" : caps.has("day_trips") ? "daytrip" : null;
  const resolveMs = Math.round(performance.now() - t0);
  const language = resolved.language;
  const locationFocus = resolved.locationFocus ?? destination;

  // --- OUT OF SCOPE ------------------------------------------------------
  // No connection to travel or this trip. Decline in one line and stop — no retrieve, no
  // compose, so there's nothing to jailbreak into doing homework / coding / general chat.
  if (resolved.outOfScope) {
    const meta: AssistantTurnMeta = {
      language,
      locationFocus: resolved.locationFocus,
      surface: "chat",
      blocks: [],
      sources: [],
      suggestedFollowups: [],
      unavailableProviders: [],
    };
    const deflection = `I can't help with that — I'm here to help plan and get the most out of your ${destination} trip. Ask me about places, food, getting around, what to book, or anything to do while you're there.`;
    return { kind: "declined", resolved, content: deflection, meta, timings: { resolveMs } };
  }

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
    return { kind: "clarify", resolved, content: resolved.clarify.question, meta, timings: { resolveMs } };
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
  const requestedImages = /\b(photo|photos|image|images|picture|pictures)\b/i.test(prompt);
  const plannedCalls = requestedImages && !resolved.toolPlan.some((call) => call.tool === "search_places")
    ? [{ tool: "search_places" as const, query: prompt.slice(0, 200), location: locationFocus }, ...resolved.toolPlan].slice(0, 3)
    : resolved.toolPlan;
  const toolPlan = plannedCalls.map((call) =>
    call.tool === "search_places" ? { ...call, location: qualify(call.location) }
      : call.tool === "directions" ? { ...call, from: qualify(call.from), to: qualify(call.to) }
      : call.tool === "stays" ? { ...call, location: qualify(call.location), checkin: call.checkin ?? tripStart, checkout: call.checkout ?? tripEnd }
      : call.tool === "flights" ? { ...call, departureDate: call.departureDate ?? tripStart }
      : call,
  );
  const rejectedNames = tripCtx.places
    .filter((entry) => entry.status === "rejected" && entry.place?.name)
    .map((entry) => entry.place!.name);
  const retrieveFilters = { dislikes, currency: resolveCurrency(tripCtx.preferences), interests: readStrList(tripCtx.preferences, "interests"), likes: readStrList(tripCtx.preferences, "likes"), tripStart: tripCtx.trip?.start_date, tripEnd: tripCtx.trip?.end_date, excludeNames: rejectedNames, travelers: tripCtx.trip?.travelers };
  const grounded = (result: Awaited<ReturnType<typeof retrieveEvidence>>) =>
    result.places.length > 0 || result.sources.length > 0 || result.routes.length > 0 || result.events.length > 0 || result.flights.length > 0 || result.stays.length > 0 || Boolean(result.weather);

  const tRetrieve = performance.now();
  let evidence = await retrieveEvidence(toolPlan, retrieveFilters, signal);
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
    const retried = await retrieveEvidence(broadened, retrieveFilters, signal);
    if (grounded(retried)) evidence = retried;
  }
  const retrieveMs = Math.round(performance.now() - tRetrieve);
  const hasGrounding = grounded(evidence);

  if (needsGrounding && !hasGrounding) {
    const fallback = "I couldn't verify anything for this right now — the travel data providers returned nothing. Try again, or narrow it to a specific place or activity.";
    const meta: AssistantTurnMeta = { language, locationFocus: resolved.locationFocus, surface: "chat", blocks: [], sources: [], suggestedFollowups: resolved.suggestedFollowups, unavailableProviders: evidence.unavailableProviders.slice(0, 12) };
    return {
      kind: "ungrounded", resolved, content: fallback, meta, timings: { resolveMs, retrieveMs },
      toolsUsed: toolPlan.map((call) => call.tool), providersFailed: evidence.unavailableProviders,
    };
  }

  // Persist a same-origin path, never the hostname of the laptop/phone that created the turn.
  const photoUrl = (name: string) => `/api/trips/${tripId}/places/google/photo?name=${encodeURIComponent(name)}`;
  // The model must only see the places it will actually get cards for, so its reply can't
  // reference a place with no card. This slice IS the `place_list` block below.
  const cardPlaceGroups = (evidence.placeGroups?.length ?? 0) > 1
    ? evidence.placeGroups!.map((group) => ({ ...group, places: group.places.slice(0, 6) }))
    : [{ label: "", places: evidence.places.slice(0, 6) }];
  const cardPlaces = cardPlaceGroups.flatMap((group) => group.places);
  const compactPlaces = cardPlaces.map((place) => ({
    provider: place.provider, providerId: place.providerId, name: place.name, category: place.category, address: place.address,
    rating: place.rating, userRatingCount: place.userRatingCount, sourceUrl: place.sourceUrl, photoName: place.photoNames?.[0],
  }));
  const compactSources = evidence.sources.map((source) => ({ title: source.title, url: source.url, content: source.content.slice(0, 700) }));
  const compactEvents = evidence.events.slice(0, 8).map((event) => ({
    name: event.title, date: event.date, venue: event.venue, url: event.url,
    whenVsTrip: event.relToTrip === "in" ? "during the trip"
      : event.relToTrip === "before" ? `${event.offsetDays}d before the trip`
      : event.relToTrip === "after" ? `${event.offsetDays}d after the trip` : undefined,
    // Internal ranking hint only — a coarse bucket, never a number the model can quote.
    prominence: typeof event.rank === "number" ? (event.rank >= 70 ? "major" : event.rank >= 45 ? "notable" : "small") : undefined,
  }));
  const eventsInWindow = evidence.events.filter((event) => event.relToTrip === "in");
  const nearestEventMiss = evidence.events
    .filter((event) => event.relToTrip === "before" || event.relToTrip === "after")
    .sort((a, b) => (a.offsetDays ?? 0) - (b.offsetDays ?? 0))[0];
  const eventCall = toolPlan.find((call): call is Extract<typeof call, { tool: "events" }> => call.tool === "events");
  // A single clear in-window event the traveller is building the trip around — threaded into
  // the itinerary builder below as a fixed stop, not just a card off to the side. Ambiguous
  // (0 or 2+ candidates, e.g. an artist playing multiple nights) is left for the traveller to
  // pick via the clarifying chips below; only a single unambiguous match anchors the plan.
  const anchorEvent = eventsInWindow.length === 1
    ? { title: eventsInWindow[0].title, venue: eventsInWindow[0].venue, date: eventsInWindow[0].startDate ?? eventsInWindow[0].date ?? "", time: eventsInWindow[0].date?.match(/(\d{2}:\d{2})\s*$/)?.[1] }
    : null;
  const eventsGuidance = compactEvents.length
    ? [
        "The events shown as cards are the ONLY events you may present as confirmed; never state a date or venue for one that is not a card, and do not restate every title/date/venue/link.",
        "Describe an event the way a traveller would want to hear it: who is performing or what it is, what they're known for, the kind of night out it makes, and how it fits the traveller's interests. `prominence` is an internal hint for which one or two to lead with — never mention it, a popularity/pull score, a number, crowd size, or the data source. If you genuinely don't know the act, keep it to one plain line and don't pad with vague hype.",
        eventsInWindow.length
          ? `${eventsInWindow.length} fall during the trip — lead with the one or two that best fit the traveller's interests, and say why in traveller terms.`
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
      operatingAirline: offer.operatingAirline, cabinClass: offer.cabinClass, baggage: offer.baggage,
      airports: offer.originAirport && offer.destinationAirport ? `${offer.originAirport} → ${offer.destinationAirport}` : undefined,
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

  // Weather → a card, not a paragraph. Forecast buckets when the trip is close; otherwise a
  // structured "typical <month>" distilled from the web notes just retrieved.
  const WEATHER_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const weatherMonth = (() => {
    if (typeof tripStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(tripStart)) return null;
    const name = WEATHER_MONTHS[Number(tripStart.slice(5, 7)) - 1];
    const dom = Number(tripStart.slice(8, 10));
    return dom >= 21 ? `late ${name}` : dom <= 10 ? `early ${name}` : name;
  })();
  // A budget question can be mis-tagged "essentials"; don't also drag in a weather card / checklist.
  const weatherIntent = (resolved.intent === "weather" || resolved.intent === "essentials") && !caps.has("budget");
  // A live forecast only means something if the trip is within its reach (or under way).
  const daysToTrip = typeof tripStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tripStart)
    ? Math.round((Date.parse(tripStart) - Date.now()) / 86_400_000)
    : null;
  const tripInForecastWindow = daysToTrip !== null && daysToTrip <= 6 && daysToTrip >= -21;
  const forecastReady = tripInForecastWindow && (evidence.weatherDays?.length ?? 0) > 0;
  const seasonalReady = !forecastReady && Boolean(weatherMonth && compactSources.length > 0);
  const willShowWeatherCard = weatherIntent && (forecastReady || seasonalReady);

  const statedDailyBudget = typeof (tripCtx.preferences as Record<string, unknown>).budget === "number"
    ? ((tripCtx.preferences as Record<string, unknown>).budget as number)
    : undefined;
  // Turns whose answer is fully carried by a structured block skip the compose model
  // entirely — the block's own AI-written headline/intro is the one-line reply. Nothing
  // templated, and no brittle "did the model obey the prompt" wrestling. Each falls through
  // to a normal composed answer if its block can't be built. All run CONCURRENTLY — a
  // multi-capability turn (e.g. weather + structured_answer) mustn't pay for them in series.
  const [weatherCard, itineraryBlock, budgetBlock, optionsBlock, structuredAnswerBlock] = await Promise.all([
    !willShowWeatherCard
      ? Promise.resolve<WeatherCard | null>(null)
      : forecastReady
        ? Promise.resolve(weatherCardFromForecast(locationFocus, evidence.weatherDays!))
        : weatherCardFromSeasonal(locationFocus, weatherMonth!, compactSources.map((source) => source.content).join("\n\n"), signal),
    caps.has("itinerary")
      ? buildItineraryPlan({ prompt, tripSummary, evidence, tripCtx, anchorEvent, signal })
      : Promise.resolve(null),
    caps.has("budget")
      ? buildBudgetBreakdown({ prompt, tripSummary, currency: resolveCurrency(tripCtx.preferences), statedDailyBudget, evidence, tripCtx, signal })
      : Promise.resolve(null),
    exploreKind
      ? buildExploreOptions({ kind: exploreKind, prompt, tripSummary, evidence, tripCtx, signal })
      : Promise.resolve(null),
    caps.has("structured_answer")
      ? buildStructuredAnswer({ prompt, tripSummary, evidence, signal })
      : Promise.resolve(null),
  ]);

  // COMPOSE runs by default — it's for prose reasoning ("why this one", judgement, advice).
  // But when a block fully answers the turn on its own, skip the model entirely and use the
  // block's own one-line intro as the reply. No "a block is shown, don't repeat it" note to a
  // model that ignores it — the coordination bug can't happen if COMPOSE never runs.
  const composeSkipLine: string | null =
    (budgetBlock?.type === "budget" && budgetBlock.summary) ||
    (optionsBlock?.type === "options" && optionsBlock.intro) ||
    (structuredAnswerBlock?.type === "structured_answer" && structuredAnswerBlock.intro) ||
    (weatherCard && (resolved.intent === "essentials"
      ? `${weatherCard.headline.replace(/[.!?]?\s*$/, "")}. The full checklist is below.`
      : weatherCard.headline)) ||
    (itineraryBlock?.type === "itinerary" && (itineraryBlock.intro || "Here's a rough day-by-day — tell me to rework any day.")) ||
    null;

  const system = `${assistantSystemPrompt}

${groundingInstruction}
You have read-only lookup tools (places, web, weather, events, flights, directions, stays, and the trip's own itinerary/saved places). The evidence below is already retrieved for the plan — only call a tool for something it genuinely does not cover, such as directions between two places you just found, or a second web check. Do not re-fetch what is already below.

You are talking about: ${locationFocus}.${viewContext ? `\nThe user has this open beside the chat: ${viewContext}. Read "there", "this place", "it" as this unless the message names somewhere else.` : ""}${dislikes.length ? `\nThe traveller dislikes: ${dislikes.join(", ")}. Do not recommend, list, or describe any of these, even if they are famous or in the evidence.` : ""}
Previous messages are context only — never repeat their places, prices, or links unless they also appear in the fresh evidence below.${surfacedEarlier.size ? `\nAlready shown as cards earlier in this conversation: ${[...surfacedEarlier].slice(0, 30).join(", ")}. Don't present these again unless one is genuinely the best answer to the current question — and if so, say why it still fits.` : ""}${requestedImages ? "\nThe user asked for photos: include one markdown image per relevant place only if a supplied image URL exists; if none, say verified photos were not returned." : ""}
${feasibilityHint(typeof tripCtx.preferences.pace === "string" ? tripCtx.preferences.pace : undefined, tripCtx.itinerary.map((item) => item.day_index))}
If a recommendation usually sells out or needs timed entry, say so and suggest booking ahead.${(resolved.intent === "weather" || resolved.intent === "essentials" || evidence.weather) ? `\nWeather question: ${evidence.weather ? `a live reading is in the evidence ("${evidence.weather}") — treat it as a forecast only if the trip is within a week, otherwise as the current picture.` : "there is no live forecast (the trip is too far out for one, or the provider was down)."} ${compactSources.length ? "The web sources describe the destination's typical conditions for that month/season — build the answer from them, call it typical/seasonal (not a forecast), and say plainly whether that time of year is hot, mild, cold, wet or dry there." : "If you have nothing on the season either, say the weather is unavailable rather than guessing."} Finish with one concrete packing takeaway (umbrella, layers, sun, warm coat). Never apologise for a missing forecast when you can still describe the season.` : ""}${caps.has("itinerary") ? `\nA day-by-day itinerary is shown as a structured timeline block. Do NOT rewrite it as prose or list the stops. Give 1–2 sentences only: the shape of the trip and one thing worth booking ahead.` : ""}${caps.has("budget") ? `\nA budget breakdown block with per-category figures is shown. Reply with ONE sentence only — the rough daily total and whether it fits their budget. Never restate the category numbers.` : ""}${exploreKind ? `\nA card list of ${exploreKind === "area" ? "neighbourhoods" : "day trips"} is shown. Reply with ONE sentence — your top pick and why. Do not describe every option.` : ""}${eventsGuidance ? `\n${eventsGuidance}` : ""}${compactFlights.length ? `\nFlight fare estimates are shown as cards. Give a one-line read (cheapest vs fastest, nonstop or not). ${compactFlights.some((search) => search.exampleDate) ? "The travel date is an example — ask for their real dates." : ""} Do not quote fares or list airlines; do not invent routes.` : ""}${compactStays.length ? `\nHotel rates for ${compactStays[0].nights} night(s) are shown as cards. Say which one or two fit the budget, group, and locked places and why.${compactStays.some((search) => search.rooms) ? " Room-level rates for the hotel the user asked about are also shown; say which room type fits the group." : ""} ${compactStays.some((search) => search.exampleDates) ? "The check-in/out dates are an example — ask for their real dates." : ""} Do not list hotels or prices; do not invent any.` : ""}

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
  const checklistPromise = resolved.intent === "essentials" && !caps.has("budget") && !caps.has("structured_answer")
    ? buildEssentialsChecklist({ destination: locationFocus, tripSummary, evidence, signal })
    : Promise.resolve(null);
  const comparisonPromise = caps.has("comparison")
    ? buildComparison({ prompt, tripSummary, evidence, signal })
    : Promise.resolve(null);

  // --- COMPOSE tool setup --------------------------------------------------
  // RESOLVE's plan is already retrieved above and shown in `system`. The model may call these
  // tools for follow-ups it still needs (directions between two places it just found, a second
  // web lookup); results merge into `toolEvidence` and extend `allowedUrls`. Cards stay
  // assembled server-side from `evidence` (ADR 0002) — tool results inform the prose only.
  const { tools: composeTools, accumulated: toolEvidence } = buildComposeTools({
    filters: retrieveFilters, qualify, tripStart, tripEnd, tripCtx, signal, allowedUrls,
  });

  // --- STRUCTURE (assembled from evidence + resolver, not model JSON) ------
  const blocks: AssistantBlock[] = [];
  const distanceToLocked = (place: { latitude: number; longitude: number }): string | undefined => {
    if (tripCtx.lockedPlaces.length === 0) return undefined;
    const hit = nearest({ latitude: place.latitude, longitude: place.longitude }, tripCtx.lockedPlaces);
    return hit ? `${hit.km < 1 ? `${Math.round(hit.km * 1000)} m` : `${hit.km.toFixed(1)} km`} from ${hit.target.title}` : undefined;
  };
  // A concert / named-act / specific-kind event query is about the EVENT, not the venue.
  // Suppress the place cards (the arena, the club) so the events block below carries the turn.
  // Gated on `intent` alone (not "any events call exists") so a multi-topic turn — "restaurants
  // near the Bruno Mars show" — keeps its unrelated search_places results; the router already
  // sets intent "events" whenever the ask is actually about the event itself.
  const eventFocused = resolved.intent === "events";
  if (itineraryBlock) blocks.push(itineraryBlock);
  if (budgetBlock) blocks.push(budgetBlock);
  if (optionsBlock) blocks.push(optionsBlock);
  if (structuredAnswerBlock) blocks.push(structuredAnswerBlock);
  if (cardPlaces.length > 0 && PLACE_INTENTS.has(resolved.intent) && !eventFocused && !itineraryBlock && !optionsBlock) {
    for (const group of cardPlaceGroups) blocks.push({
      type: "place_list",
      ...(group.label ? { title: group.label.slice(0, 80) } : {}),
      places: group.places.map((place): PlaceCard => ({
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
      durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters, fare: route.fare,
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
        ...(event.imageUrl ? { imageUrl: event.imageUrl } : {}),
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
        id: offer.id?.slice(0, 240),
        airline: offer.airline.slice(0, 80),
        operatingAirline: offer.operatingAirline?.slice(0, 80),
        price: offer.priceAmount.slice(0, 20),
        currency: offer.priceCurrency.slice(0, 8),
        durationMinutes: offer.durationMinutes,
        stops: offer.stops,
        departAt: offer.departAt.slice(0, 40),
        arriveAt: offer.arriveAt.slice(0, 40),
        originAirport: offer.originAirport?.slice(0, 8),
        destinationAirport: offer.destinationAirport?.slice(0, 8),
        cabinClass: offer.cabinClass?.slice(0, 40),
        baggage: offer.baggage?.slice(0, 120),
        layoverAirports: offer.layoverAirports?.slice(0, 6),
        aircraft: offer.aircraft?.slice(0, 120),
        fareConditions: offer.fareConditions?.slice(0, 4),
        expiresAt: offer.expiresAt?.slice(0, 40),
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
  if (weatherCard) blocks.unshift({ type: "weather", retrievedAt: evidence.retrievedAt, ...weatherCard });
  // checklist / comparison / actions are appended later by `finalizeAssistantBlocks`, once the
  // caller has awaited `sideBuilders` — see the module doc comment for why they're deferred.

  // Store any trip facts the resolver inferred as pending "suggestions" (one live row per key),
  // skipping keys the trip has already confirmed. The trip-context panel surfaces them to confirm.
  await persistSuggestedFacts(supabase, tripId, resolved.suggestedFacts, tripCtx);

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

  return {
    kind: "ready",
    resolved,
    tripCtx,
    system,
    composeSkipLine,
    composeTools,
    toolEvidence,
    meta,
    allowedUrls,
    toolPlan,
    evidenceUnavailableProviders: evidence.unavailableProviders,
    cardPlaceProviderIds: cardPlaces.map((place) => place.providerId).filter(Boolean),
    sideBuilders: { checklistPromise, comparisonPromise },
    timings: { resolveMs, retrieveMs },
  };
}

/** Folds the deferred checklist/comparison/actions blocks in, in the same order the personal
 *  route always assembled them in (checklist, then comparison, then the followups "actions"
 *  chip row) — call once `sideBuilders` has settled. */
export function finalizeAssistantBlocks(
  meta: AssistantTurnMeta,
  side: { checklist: AssistantBlock | null; comparison: AssistantBlock | null },
  cardPlaceProviderIds: string[],
): AssistantTurnMeta {
  const blocks = [...meta.blocks];
  if (side.checklist) blocks.push(side.checklist);
  if (side.comparison) {
    // When we're comparing real places, carry their ids so the chat can open a live side-by-side.
    blocks.push(
      cardPlaceProviderIds.length >= 2
        ? ({ ...side.comparison, placeIds: cardPlaceProviderIds.slice(0, 4) } as AssistantBlock)
        : side.comparison,
    );
  }
  if (meta.suggestedFollowups.length > 0) blocks.push({ type: "actions", items: meta.suggestedFollowups });
  return { ...meta, blocks };
}
