import type { SupabaseClient } from "@supabase/supabase-js";
import { type AssistantBlock, type AssistantTurnMeta } from "@/packages/contracts/assistant";
import { buildComposeTools } from "@/packages/ai/compose-tools";
import { formatTripMemory, type TripContext } from "@/lib/application/trip-context";
import { resolveTurn, resolvedTurnSchema, type ResolvedTurn } from "@/lib/application/turn-resolver";
import { trivialTurnKind, type TrivialKind } from "@/lib/application/orchestrate/turn-complexity";
import { retrieveEvidence } from "@/lib/application/retrieve";
import { formatConversion, parseConversionAsk } from "@/lib/application/currency-convert";
import { fxRate } from "@/lib/server/fx";
import { resolveCurrency } from "@/lib/currency";
import { buildEssentialsChecklist } from "@/lib/application/essentials";
import { buildComparison, comparedPlaceIds } from "@/lib/application/comparison";
import { buildItineraryPlan } from "@/lib/application/itinerary-plan";
import { buildBudgetBreakdown } from "@/lib/application/budget-plan";
import { buildExploreOptions } from "@/lib/application/explore-options";
import { buildStructuredAnswer } from "@/lib/application/structured-answer";
import { weatherCardFromForecast, weatherCardFromSeasonal, type WeatherCard } from "@/lib/application/weather-card";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { applyTripUpdate, buildProposedProfileCommand } from "@/lib/application/orchestrate/trip-update-handling";
import { selectBlocks } from "@/lib/application/orchestrate/block-selection";
import { ungroundedFallback } from "@/lib/application/orchestrate/fallback-reply";
import { asksForOverview, buildTripSummary } from "@/lib/application/trip-summary";
import { buildComposeSystemPrompt } from "@/lib/application/orchestrate/system-prompt-builder";
import { askedForDatesRecently } from "@/lib/application/orchestrate/cadence";
import { broadenedPlan, isGrounded, planRetrieval, readDislikes, readStrList, retrieveFiltersFor } from "@/lib/application/orchestrate/retrieve-plan";
import { compactEvidence } from "@/lib/application/orchestrate/evidence-compaction";
import { weatherReadiness } from "@/lib/application/orchestrate/weather-readiness";
import { composeSkipLineFor, leadInLineFor } from "@/lib/application/orchestrate/compose-skip";
import type { UsageEntry } from "@/lib/ai/pricing";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";

/**
 * RESOLVE → RETRIEVE → block-builders → STRUCTURE, factored out of app/api/ai/route.ts so a
 * second caller (the group-chat @Roam route) can run the same turn without duplicating this
 * pipeline. Deliberately does NOT own: streaming vs buffering the COMPOSE reply, persisting the
 * turn (each surface has its own message table), or per-surface bookkeeping like thread-summary
 * refresh — those differ per caller and stay in the route that calls this.
 *
 * Split out of a single ~785-line file (Phase 1.3, docs/overhaul/roadmap/phase-1-structural-refactor.md):
 * trip-update-handling.ts (applying proposedTripUpdate/proposedProfileUpdate), block-selection.ts
 * (which structured blocks a turn shows), and system-prompt-builder.ts (the COMPOSE system
 * prompt) each moved into their own file. What's left here is the top-level RESOLVE → RETRIEVE →
 * side-builders → STRUCTURE → meta sequence, plus the evidence-compaction and RETRIEVE-shaping
 * steps that sit between them — genuinely sequence-specific, not a further extractable unit on
 * its own.
 *
 * Checklist/comparison are handed back as still-running promises (see `sideBuilders`) rather than
 * awaited here: in the personal route they're kicked off before COMPOSE so they overlap with the
 * model's TTFT instead of adding to it. `finalizeAssistantBlocks` folds them in once a caller is
 * ready — the buffered group-chat caller can just await them immediately after its own compose call.
 */

function surfaceForIntent(intent: ResolvedTurn["intent"]): AssistantTurnMeta["surface"] {
  if (["discovery", "nightlife", "food", "activities", "history_culture", "compare"].includes(intent)) return "explore";
  if (intent === "stays") return "stay";
  if (intent === "transport") return "transport";
  if (intent === "weather" || intent === "essentials") return "essentials";
  return "chat";
}


/** True when this suggestion key already has a confirmed value on the trip. */
function factAlreadyConfirmed(key: string, ctx: TripContext): boolean {
  const p = ctx.preferences;
  const hasList = (v: unknown) => Array.isArray(v) && v.length > 0;
  switch (key) {
    case "budget": return p.budget !== undefined && p.budget !== "";
    case "group": return typeof p.groupType === "string" && p.groupType !== "";
    case "pace": return typeof p.pace === "string" && p.pace !== "";
    case "interests": return hasList(p.interests) || hasList(p.likes);
    case "dietary": return hasList(p.dietaryNeeds);
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
  /** False in group chat: a personal preference (likes/dislikes/budget/pace/dietary/
   *  accessibility) stated by ONE member has no clean owner in a shared trip — RESOLVE has no
   *  concept of "whose preference this is" for a multi-speaker transcript, so a passing remark
   *  from one member could otherwise get proposed as a change to the trip's single shared
   *  preference document, for any member to confirm on their behalf. Trip-FACT updates
   *  (destination/dates/travelers, handled separately above) stay enabled in group chat — those
   *  are legitimately shared by nature, unlike a personal like/dislike. Default true (personal
   *  chat has exactly one unambiguous "the user"). */
  allowPreferenceLearning?: boolean;
  signal?: AbortSignal;
  /** Injectable for tests (e.g. "is today within the trip's dates" in itinerary-anchor.ts);
   *  defaults to the real current time. */
  now?: Date;
  /** Phase 2.6.2 (docs/overhaul/roadmap/phase-2-speed.md): fires once, right before RETRIEVE
   *  starts (i.e., RESOLVE just finished), with the tool names RESOLVE just planned — a caller
   *  streaming the response can use this to show what's actually being looked up ("checking
   *  places…", "getting directions…") instead of a generic "checking live sources…". Never
   *  fires for a trivial turn (Phase 2.5) or a turn that exits before RETRIEVE (out-of-scope/
   *  clarify). Can fire with an empty array (e.g. intent trip_memory plans no tools at all). */
  onRetrieveStart?: (tools: ResolvedTurn["toolPlan"][number]["tool"][]) => void;
};

type BaseResult = {
  resolved: ResolvedTurn & { degraded?: boolean; modelUsed?: string };
  timings: { resolveMs: number; retrieveMs?: number };
  /** Every model call this turn made outside of COMPOSE (RESOLVE + any bulk block-builders),
   *  each tagged with the model that actually answered it — COMPOSE's own usage is tracked
   *  separately by its caller (it already knows its own model/tokens via `streamText`/
   *  `generateText`'s usage promise). Summed with COMPOSE's usage via `sumCostUsd` for the
   *  turn's true total cost, rather than pricing the whole turn off one blended model string. */
  usage: UsageEntry[];
};

export type AssistantTurnResult =
  | (BaseResult & { kind: "declined"; content: string; meta: AssistantTurnMeta })
  | (BaseResult & { kind: "clarify"; content: string; meta: AssistantTurnMeta })
  | (BaseResult & { kind: "ungrounded"; content: string; meta: AssistantTurnMeta; toolsUsed: string[]; providersFailed: string[] })
  | (BaseResult & {
      kind: "ready";
      tripCtx: TripContext;
      system: string;
      composeSkipLine: string | null;
      /** The skip line is the deterministic card lead-in (built from the evidence, no links), so a caller has nothing to verify in it. */
      composeSkipIsLeadIn?: boolean;
      // Partial, not the exact full set: a trivial turn (Phase 2.5) hands back {} on purpose —
      // COMPOSE gets no tools at all for a plain greeting/acknowledgment, nothing to look up.
      composeTools: Partial<ReturnType<typeof buildComposeTools>["tools"]>;
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

/** Canned reply for a trivial turn, by phrase kind — no model call, so wording is fixed rather
 *  than reworded per request. Only ever reached for one of turn-complexity.ts's hand-curated
 *  English phrases, so a fixed English reply (no language-matching model call to do) is safe. */
function trivialReply(kind: TrivialKind, destination?: string | null): string {
  const trip = destination ? ` for your ${destination} trip` : " for your trip";
  switch (kind) {
    case "greeting":
      return `Hey! Happy to help — what would you like to plan${trip} next?`;
    case "thanks":
      return `You're welcome! Let me know if there's anything else${trip}.`;
    case "farewell":
      return `Take care! Come back anytime to keep planning${trip}.`;
    case "acknowledgment":
      return `Got it — let me know what's next${trip}.`;
  }
}

export async function runAssistantTurn(deps: AssistantTurnDeps, req: AssistantTurnRequest): Promise<AssistantTurnResult> {
  const { supabase, tripId } = deps;
  let tripCtx = req.tripCtx;
  const { prompt, history, viewContext, signal } = req;
  const allowPreferenceLearning = req.allowPreferenceLearning ?? true;
  let tripSummary = req.tripSummary;
  const surfacedEarlier = req.surfacedEarlier ?? new Set<string>();
  const deriveTripSummary = req.deriveTripSummary ?? ((ctx: TripContext) => formatTripMemory(ctx));
  const dislikes = readDislikes(tripCtx.preferences);
  const accessibilityNeeds = readStrList(tripCtx.preferences, "accessibilityNeeds");
  // Every non-COMPOSE model call this turn makes (RESOLVE, then any bulk block-builders below)
  // pushes its usage here, tagged with its own model — see `BaseResult.usage`'s doc comment.
  // A plain mutable array works even for the two side-builders, which are still running when
  // this function returns: they hold the same reference and push into it once they settle,
  // and every caller awaits them (`sideBuilders`) before reading a turn's total cost.
  const usageLog: UsageEntry[] = [];
  const onUsage = (entry: UsageEntry) => usageLog.push(entry);

  const t0 = performance.now();

  // --- TRIVIAL SHORT-CIRCUIT (Phase 2.5, docs/overhaul/roadmap/phase-2-speed.md) -------------
  // A pure greeting/acknowledgment needs zero lookup AND no real reply-writing — it's one of
  // ~20 hand-curated exact phrases (turn-complexity.ts), so its reply can be canned instead of
  // asking COMPOSE's model to write "Hi there!" from scratch. Skips RESOLVE, RETRIEVE, AND
  // COMPOSE entirely via the same `composeSkipLine` short-circuit a fully-answered structured
  // block already uses below (budget/options/itinerary/weather) — live-caught: this used to
  // still make a full COMPOSE call for a bare "hi", the single biggest reason a plain greeting
  // took as long to answer as a real question. `resolved` is still a full, schema-valid
  // ResolvedTurn (same safe-default pattern resolveTurn itself falls back to on total failure)
  // so every downstream consumer of `AssistantTurnResult` sees a normal shape, just cheaply.
  // A reply that needs no model at all: RESOLVE, RETRIEVE and COMPOSE are skipped through the same `composeSkipLine`
  // short-circuit a fully-answered structured block uses. `resolved` is still a full, schema-valid ResolvedTurn
  // (the same safe-default pattern resolveTurn falls back to on total failure) so every consumer sees a normal shape.
  const cannedTurn = (line: string): AssistantTurnResult => {
    const cannedResolved = resolvedTurnSchema.parse({ intent: "chitchat" });
    // Hand-built, not derived from a shared default — if `AssistantTurnMeta` grows a new
    // OPTIONAL field later, TypeScript won't force this literal to set it (only a new REQUIRED
    // field would). Check this stays reasonable whenever that type changes.
    const meta: AssistantTurnMeta = {
      language: cannedResolved.language,
      locationFocus: null,
      surface: "chat",
      blocks: [],
      sources: [],
      suggestedFollowups: [],
      unavailableProviders: [],
    };
    return {
      kind: "ready",
      resolved: cannedResolved,
      tripCtx,
      // Unused whenever composeSkipLine is set (always, on this path) — COMPOSE never runs to read it.
      system: "",
      composeSkipLine: line,
      composeTools: {},
      toolEvidence: { places: [], sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: new Date().toISOString(), usedTools: [] },
      meta,
      allowedUrls: new Set<string>(),
      toolPlan: [],
      evidenceUnavailableProviders: [],
      cardPlaceProviderIds: [],
      sideBuilders: { checklistPromise: Promise.resolve(null), comparisonPromise: Promise.resolve(null) },
      timings: { resolveMs: Math.round(performance.now() - t0) },
      usage: usageLog,
    };
  };

  const trivialKind = trivialTurnKind(prompt);
  if (trivialKind) return cannedTurn(trivialReply(trivialKind, tripCtx.trip?.destination));

  // --- CURRENCY CONVERSION SHORT-CIRCUIT -------------------------------------
  // "Convert 1,184 EUR and 2,200 GBP to CAD" is arithmetic on today's reference rates, not a travel question for the
  // model (it used to be routed to the weather card and a packing list). Answered directly, with the rates it used.
  const conversion = parseConversionAsk(prompt, resolveCurrency(tripCtx.preferences));
  if (conversion) {
    const rates = new Map(await Promise.all([...new Set(conversion.items.map((i) => i.from))].map(async (code) => [code, await fxRate(code, conversion.to, signal)] as const)));
    return cannedTurn(formatConversion(conversion, rates));
  }

  // --- RESOLVE ---------------------------------------------------------------
  const resolved = await resolveTurn({ message: prompt, history, tripSummary, viewContext, signal, onUsage });
  const tripUpdateResult = await applyTripUpdate({ supabase, tripId, tripCtx, prompt, resolved, tripSummary, deriveTripSummary });
  tripCtx = tripUpdateResult.tripCtx;
  const destination = tripUpdateResult.destination;
  const context = tripUpdateResult.context;
  tripSummary = tripUpdateResult.tripSummary;
  const tripUpdateReceipt = tripUpdateResult.tripUpdateReceipt;
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
      blocks: tripUpdateReceipt ? [tripUpdateReceipt] : [],
      sources: [],
      suggestedFollowups: [],
      unavailableProviders: [],
    };
    const deflection = `I can't help with that — I'm here to help plan and get the most out of your ${destination} trip. Ask me about places, food, getting around, what to book, or anything to do while you're there.`;
    return { kind: "declined", resolved, content: deflection, meta, timings: { resolveMs }, usage: usageLog };
  }

  // --- CLARIFY -------------------------------------------------------------
  if (resolved.clarify) {
    const meta: AssistantTurnMeta = {
      language,
      locationFocus: resolved.locationFocus,
      surface: "chat",
      blocks: [
        ...(tripUpdateReceipt ? [tripUpdateReceipt] : []),
        { type: "clarifying_question", question: resolved.clarify.question, chips: resolved.clarify.chips },
      ],
      sources: [],
      suggestedFollowups: resolved.suggestedFollowups,
      unavailableProviders: [],
    };
    return { kind: "clarify", resolved, content: resolved.clarify.question, meta, timings: { resolveMs }, usage: usageLog };
  }

  // --- RETRIEVE ---------------------------------------------------------------
  req.onRetrieveStart?.(resolved.toolPlan.map((call) => call.tool));
  const { anchor, qualify, tripStart, tripEnd, requestedImages, mealAnchor, toolPlan } = planRetrieval({ resolved, prompt, tripCtx, locationFocus, caps, now: req.now ?? new Date() });
  const retrieveFilters = retrieveFiltersFor(tripCtx, dislikes);


  // A single overall ceiling on the whole RETRIEVE stage — each individual provider fetch
  // already times out on its own (~8-10s), but a multi-tier fallback inside one tool call (e.g.
  // `directions`) can still chain several of those sequentially with nothing bounding the total.
  // Past this deadline, everything still in flight aborts and is marked unavailable rather than
  // gating COMPOSE indefinitely.
  const retrieveSignal = withDeadline(signal, AI_DEADLINE_MS.retrieve);
  const tRetrieve = performance.now();
  let evidence = await retrieveEvidence(toolPlan, retrieveFilters, retrieveSignal);
  const needsGrounding = toolPlan.length > 0;

  // Nothing came back for a plan that needed grounding — before giving up, retry once with a
  // broader query (generic term, trip destination as the location). Catches an over-specific
  // resolver plan or a place name the provider didn't recognise.
  if (needsGrounding && !isGrounded(evidence)) {
    const broadened = broadenedPlan(toolPlan, resolved.intent, anchor);
    const retried = await retrieveEvidence(broadened, retrieveFilters, retrieveSignal);
    if (isGrounded(retried)) evidence = retried;
  }
  const retrieveMs = Math.round(performance.now() - tRetrieve);
  const hasGrounding = isGrounded(evidence);

  if (needsGrounding && !hasGrounding) {
    const { content: fallback, actions } = ungroundedFallback(resolved.locationFocus, resolved.suggestedFollowups);
    const meta: AssistantTurnMeta = { language, locationFocus: resolved.locationFocus, surface: "chat", blocks: [...(tripUpdateReceipt ? [tripUpdateReceipt] : []), ...(actions ? [actions] : [])], sources: [], suggestedFollowups: resolved.suggestedFollowups, unavailableProviders: evidence.unavailableProviders.slice(0, 12) };
    return {
      kind: "ungrounded", resolved, content: fallback, meta, timings: { resolveMs, retrieveMs }, usage: usageLog,
      toolsUsed: toolPlan.map((call) => call.tool), providersFailed: evidence.unavailableProviders,
    };
  }

  // Persist a same-origin path, never the hostname of the laptop/phone that created the turn.
  const photoUrl = (name: string) => `/api/trips/${tripId}/places/google/photo?name=${encodeURIComponent(name)}`;
  const { cardPlaceGroups, cardPlaces, compactPlaces, compactSources, compactEvents, eventsInWindow, eventCall, anchorEvent, eventsGuidance, compactFlights, compactStays, allowedUrls } = compactEvidence({ evidence, toolPlan, requestedImages, photoUrl });

  const { weatherMonth, forecastReady, willShowWeatherCard } = weatherReadiness({ intent: resolved.intent, caps, tripStart, evidence, sourceCount: compactSources.length });

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
        : weatherCardFromSeasonal(locationFocus, weatherMonth!, compactSources.map((source) => source.content).join("\n\n"), language, signal, onUsage),
    caps.has("itinerary")
      ? buildItineraryPlan({ prompt, tripSummary, evidence, tripCtx, anchorEvent, requestedDays: resolved.itineraryDays, language, signal, onUsage })
      : Promise.resolve(null),
    caps.has("budget")
      ? buildBudgetBreakdown({ prompt, tripSummary, currency: resolveCurrency(tripCtx.preferences), statedDailyBudget, evidence, tripCtx, language, signal, onUsage })
      : Promise.resolve(null),
    exploreKind
      ? buildExploreOptions({ kind: exploreKind, prompt, tripSummary, evidence, tripCtx, language, signal, onUsage })
      : Promise.resolve(null),
    caps.has("structured_answer")
      ? buildStructuredAnswer({ prompt, tripSummary, evidence, language, signal, onUsage })
      : Promise.resolve(null),
  ]);

  // COMPOSE runs by default — it's for prose reasoning ("why this one", judgement, advice).
  // But when a block fully answers the turn on its own, skip the model entirely and use the
  // block's own one-line intro as the reply. No "a block is shown, don't repeat it" note to a
  // model that ignores it — the coordination bug can't happen if COMPOSE never runs.
  const composeSkipLine = composeSkipLineFor({ intent: resolved.intent, budgetBlock, optionsBlock, structuredAnswerBlock, weatherCard, itineraryBlock });

  const system = buildComposeSystemPrompt({
    hasGrounding, locationFocus, viewContext, dislikes, accessibilityNeeds, surfacedEarlier, requestedImages,
    tripCtx, intent: resolved.intent, evidence, compactSources, language,
    savedThisTurn: tripUpdateReceipt?.type === "trip_update" ? tripUpdateReceipt.changes.map((c) => `${c.label} ${c.from ?? "not set"} → ${c.to ?? "not set"}`).join("; ") : undefined,
    // Actual block presence, not just "was it requested" — see the param doc comment for why.
    showsItineraryBlock: itineraryBlock?.type === "itinerary",
    mapCards: [
      evidence.routes.length > 0 ? "the route card (tap an option on it, or its Map button, to see every way there step by step with the route on a map)" : "",
      cardPlaces.some((place) => place.latitude || place.longitude) ? "the place cards" : "",
      evidence.stays.some((search) => search.options?.some((option) => option.latitude != null)) ? "the hotel cards" : "",
      itineraryBlock?.type === "itinerary" && itineraryBlock.days.some((day) => day.stops.some((stop) => stop.placeId)) ? "the itinerary" : "",
    ].filter(Boolean),
    showsBudgetBlock: budgetBlock?.type === "budget",
    exploreKind: optionsBlock?.type === "options" ? exploreKind : null,
    eventsGuidance,
    compactFlights, compactStays, tripSummary, context, compactPlaces, compactEvents, photoUrl,
    mealAnchor,
    datesAlreadyAsked: askedForDatesRecently(history),
    proposedChange: buildProposedProfileCommand(tripId, resolved, allowPreferenceLearning) ? JSON.stringify(resolved.proposedProfileUpdate) : undefined,
  });

  // Side builders start now and overlap with the queue slot + model TTFB; awaited when meta is
  // assembled. Each still pushes its usage onto the same `usageLog` (by reference) once it
  // settles — every caller awaits `sideBuilders` before reading `result.usage` for turn cost.
  const checklistPromise = resolved.intent === "essentials" && !caps.has("budget") && !caps.has("structured_answer")
    ? buildEssentialsChecklist({ destination: locationFocus, tripSummary, evidence, language, signal, onUsage })
    : Promise.resolve(null);
  const comparisonPromise = caps.has("comparison")
    ? buildComparison({ prompt, tripSummary, evidence, language, signal, onUsage })
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
  const tripSummaryBlock = resolved.intent === "trip_memory" && asksForOverview(prompt) ? buildTripSummary(tripCtx) : null;
  const blocks = selectBlocks({
    tripSummaryBlock,
    prompt,
    resolved, evidence, tripCtx, itineraryBlock, budgetBlock, optionsBlock, structuredAnswerBlock,
    weatherCard, tripUpdateReceipt, cardPlaces, cardPlaceGroups, eventCall, eventsInWindow,
    // Cards are ~250 px wide: ask for a card-sized rendition, not the full 800 px.
    photoUrl: (name: string) => `${photoUrl(name)}&w=480`,
  });
  // checklist / comparison / actions are appended later by `finalizeAssistantBlocks`, once the
  // caller has awaited `sideBuilders` — see the module doc comment for why they're deferred.

  // Store any trip facts the resolver inferred as pending "suggestions" (one live row per key),
  // skipping keys the trip has already confirmed. The trip-context panel surfaces them to
  // confirm — not awaited: it already swallows its own errors (see its own try/catch), and
  // nothing below this line depends on it, so blocking COMPOSE's start on this DB round-trip
  // for a nice-to-have UI hint isn't worth the added latency on every substantive turn.
  void persistSuggestedFacts(supabase, tripId, resolved.suggestedFacts, tripCtx);

  const proposedCommand = buildProposedProfileCommand(tripId, resolved, allowPreferenceLearning);

  // When the cards alone answer a plain lookup, a model-written paragraph would only repeat them (and costs the whole COMPOSE
  // call): a one-line lead-in is the reply. Only when nothing else needs saying — grounded, English, no web sources to weigh,
  // no provider that failed, no trip change to report — and exactly one kind of card is shown (see `cardLeadIn`).
  const leadInLine = leadInLineFor({ composeSkipLine, resolved, prompt, language, hasGrounding, tripUpdateReceipt, sourceCount: compactSources.length, unavailableProviderCount: evidence.unavailableProviders.length, blocks, locationFocus });

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
    composeSkipLine: composeSkipLine ?? leadInLine,
    composeSkipIsLeadIn: !composeSkipLine && leadInLine !== null,
    composeTools,
    toolEvidence,
    meta,
    allowedUrls,
    toolPlan,
    evidenceUnavailableProviders: evidence.unavailableProviders,
    cardPlaceProviderIds: cardPlaces.map((place) => place.providerId).filter(Boolean),
    sideBuilders: { checklistPromise, comparisonPromise },
    timings: { resolveMs, retrieveMs },
    usage: usageLog,
  };
}

/** Folds the deferred checklist/comparison/actions blocks in, in the same order the personal
 *  route always assembled them in (checklist, then comparison, then the followups "actions"
 *  chip row) — call once `sideBuilders` has settled. */
export function finalizeAssistantBlocks(
  meta: AssistantTurnMeta,
  side: { checklist: AssistantBlock | null; comparison: AssistantBlock | null },
): AssistantTurnMeta {
  const blocks = [...meta.blocks];
  if (side.checklist) blocks.push(side.checklist);
  if (side.comparison) {
    // When the options compared ARE real places shown this turn, carry their ids so the chat can open a live side-by-side.
    // (Not merely "some places were found": comparing two neighbourhoods while bagel shops were also found is not a place comparison.)
    const shown = meta.blocks.flatMap((block) => (block.type === "place_list" ? block.places : []));
    const placeIds = side.comparison.type === "comparison" ? comparedPlaceIds(side.comparison.rows, shown) : [];
    blocks.push(placeIds.length >= 2 ? ({ ...side.comparison, placeIds } as AssistantBlock) : side.comparison);
  }
  if (meta.suggestedFollowups.length > 0) blocks.push({ type: "actions", items: meta.suggestedFollowups });
  return { ...meta, blocks };
}
