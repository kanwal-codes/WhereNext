import { NextResponse, after } from "next/server";
import { z } from "zod";
import { generateText, stepCountIs } from "ai";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { loadTripContext, formatTripMemory } from "@/lib/application/trip-context";
import { runAssistantTurn, finalizeAssistantBlocks } from "@/lib/application/orchestrate/run-turn";
import { composeModelChain } from "@/packages/ai/compose-model";
import { AI_DEADLINE_MS, COMPOSE_MAX_STEPS, DAILY_TRIP_TURN_LIMIT, DAILY_TURN_LIMIT, withDeadline } from "@/packages/ai/model-policy";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { compactAiMessages } from "@/packages/contracts/ai-request";
import { stripReasoning } from "@/lib/ai/strip-reasoning";
import { finalizeAssistantText } from "@/lib/application/evaluator";
import { withTripAiTask } from "@/lib/server/trip-ai-queue";
import { recordAiTurn } from "@/lib/server/ai-turn-trace";
import { estimateTokens, sumCostUsd, type UsageEntry } from "@/lib/ai/pricing";
import { logger } from "@/lib/server/logger";
import { createGroupChatRepository } from "@/features/group-chat/infrastructure/groupChatRepository";
import { mentionsRoam } from "@/features/group-chat/domain/message";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { tripMemberIdentities } from "@/lib/server/trip-member-identities";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import type { AssistantTurnMeta } from "@/packages/contracts/assistant";

const HISTORY_LIMIT = 50;

const bodySchema = z.object({
  messageId: z.string().min(1),
  // Set by the "Ask Roam about this" message action (long-press / inline expand, same surface
  // as reactions) — lets any member point Roam at any user message, not just one that literally
  // contains the text "@Roam". The typed-mention path (explicit omitted/false) stays stricter:
  // only the sender's own message, and only if it actually mentions Roam.
  explicit: z.boolean().optional(),
});

/** userId -> a display name, best-effort (name/full_name metadata, else the email's local part).
 *  Shared with the members-list route via tripMemberIdentities, so a burst of messages in the
 *  same trip — and a page load hitting /members in the same window — reuse one Auth Admin
 *  lookup instead of each fanning out their own. */
async function memberNames(tripId: string): Promise<Map<string, string>> {
  try {
    const identities = await tripMemberIdentities(tripId);
    return new Map([...identities].map(([userId, identity]) => [userId, identity.name]));
  } catch (error) {
    // Admin client unavailable — replies fall back to "Someone" below. Logged because a real
    // outage here silently degrades every reply's attribution instead of visibly failing.
    logger.warn({ err: error }, "member identity lookup failed; group-chat replies will show \"Someone\"");
    return new Map();
  }
}

/**
 * Roam's reply in the shared group chat — strictly reactive: this route is the ONLY writer
 * of role='assistant' group_messages rows, and it only ever speaks on an explicit trigger bound
 * to one specific message id (never "whatever's newest in the thread" — with several members
 * texting at once, that changes out from under a handler between the client's send and this
 * call, either dropping a mention or answering the wrong one). Two ways to trigger it, both
 * re-validated server-side against the actual message:
 *   - typed `@Roam` mention: must be the caller's own message, and it must actually contain
 *     the mention text.
 *   - `explicit: true` (the "Ask Roam about this" message action, alongside reactions): works
 *     on any user message in the trip, not just your own or one that says "@Roam" — matches how
 *     Slack/Discord message actions work, bound to the exact message regardless of who sent it.
 * Either way the reply's metadata carries `replyToMessageId` so the client can thread it back
 * to what it's answering, rather than just appending it wherever it lands in the flat list.
 *
 * Runs the SAME RESOLVE→RETRIEVE→tool-calling→COMPOSE→STRUCTURE pipeline as the personal
 * Conversation tab (via `runAssistantTurn`), so a group-chat @Roam reply gets the same place/
 * stay/itinerary cards and can open the same side panel. Buffered (`generateText`, not
 * `streamText`) — same reasoning as compare-chat/route.ts: no clean way to fail over to another
 * provider mid-stream once partial content has reached the client, and `generateText` supports
 * the identical tools/stopWhen/providerOptions shape, so nothing about tool-calling requires
 * streaming specifically.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { registered: true });
    const repo = createGroupChatRepository(supabase);
    // Roam's own rows are written through the service-role client — regular members' sessions
    // are RLS-restricted to role='user' inserts (see migration 0027), so a request-scoped client
    // can't write an assistant row even if this handler tried to.
    const writeRepo = createGroupChatRepository(createSupabaseAdminClient());

    // Same daily ceiling as the personal /api/ai route — this triggers the identical
    // RESOLVE/RETRIEVE/COMPOSE pipeline and cost. trip-ai-queue.ts only serializes per
    // (trip, user); the per-trip ceiling right below is what actually bounds a trip's total.
    if (!(await withinRateLimit(`ai-turn:${user.id}`, DAILY_TURN_LIMIT, 24 * 60 * 60_000))) {
      return NextResponse.json({ error: "You've hit today's limit for assistant messages. Try again tomorrow." }, { status: 429 });
    }
    // Group chat is exactly the scenario a per-user-only limit misses: several members can each
    // stay well under their own ceiling while collectively running up one trip's shared cost.
    if (!(await withinRateLimit(`ai-turn-trip:${tripId}`, DAILY_TRIP_TURN_LIMIT, 24 * 60 * 60_000))) {
      return NextResponse.json({ error: "This trip has hit today's shared assistant limit. Try again tomorrow." }, { status: 429 });
    }

    const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsedBody.success) return NextResponse.json({ error: "Missing message id" }, { status: 400 });

    const [tripCtx, history, names] = await Promise.all([
      loadTripContext(supabase, tripId),
      repo.list(tripId, user.id, { limit: HISTORY_LIMIT }),
      memberNames(tripId),
    ]);

    // Fall back to a direct lookup when the target has aged out of the last HISTORY_LIMIT
    // messages `repo.list()` fetched above — a busy trip can easily push an older message past
    // that window before "Ask Roam about this" is used on it, and this used to 409 as if the
    // action were misused rather than legitimately targeting an older message.
    const target = history.find((m) => m.id === parsedBody.data.messageId) ?? (await repo.getById(tripId, parsedBody.data.messageId, user.id));
    const eligible = Boolean(
      target?.role === "user" &&
        (parsedBody.data.explicit ? true : target.userId === user.id && mentionsRoam(target.content)),
    );
    if (!target || !eligible) {
      return NextResponse.json({ error: "Nothing to reply to" }, { status: 409 });
    }
    // Retry-safe per (message, asker): a client retry (or the "Retry" toast action) resubmits
    // the same message id and upserts onto the same reply row instead of composing a second one
    // — but keyed per-asker too, so two different members explicitly asking about the same
    // message each get their own reply rather than overwriting each other's.
    const idempotencyKey = `roam-reply:${target.id}:${user.id}`;
    // Dedupes the COMPUTATION, not just the write below — append()'s own upsert only collapses
    // two concurrent requests' storage, but each would still independently run the full
    // RESOLVE/RETRIEVE/COMPOSE pipeline first, and the losing request's HTTP response would show
    // whatever IT generated even though a different reply is what actually gets persisted. A
    // double-click, a slow first attempt plus a "Retry", or two tabs hitting this at once all
    // reach this same path.
    const existingReply = await writeRepo.getByIdempotencyKey(tripId, "assistant", idempotencyKey);
    if (existingReply) return NextResponse.json({ message: existingReply }, { status: 200 });

    // Chat-completion messages have no per-speaker field, so a human turn folds the sender's
    // name into its content ("Alex: ...") — Roam's own prior replies stay plain "assistant" turns.
    // `prompt` (fed to RESOLVE) stays the raw, unprefixed text of the message that mentioned Roam.
    const turns = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) =>
        m.role === "user"
          ? { role: "user" as const, content: `${names.get(m.userId ?? "") ?? "Someone"}: ${m.content}` }
          : { role: "assistant" as const, content: m.content },
      );

    // Places (and hotels) Roam already showed as cards earlier in THIS group thread — same fix
    // as the personal /api/ai route (see its own `surfacedEarlier` comment), which this route
    // never had: without it, @Roam had no memory of its own prior group-chat replies and could
    // re-list the identical place list turn after turn in the same thread.
    const surfacedEarlier = new Set<string>();
    for (const message of history) {
      const blocks = (message.metadata as { blocks?: AssistantTurnMeta["blocks"] } | null)?.blocks;
      for (const block of blocks ?? []) {
        if (block.type === "place_list") for (const place of block.places) surfacedEarlier.add(place.name);
        else if (block.type === "stays") for (const hotel of block.items) surfacedEarlier.add(hotel.name);
      }
    }

    const t0 = performance.now();
    const result = await runAssistantTurn(
      { supabase, tripId },
      {
        tripCtx, prompt: target.content, history: turns, tripSummary: formatTripMemory(tripCtx), signal: request.signal,
        surfacedEarlier,
        // One member's stated preference has no clean owner in a shared group thread — see
        // AssistantTurnRequest.allowPreferenceLearning's doc comment. Trip-fact updates
        // (destination/dates/travelers) stay enabled; only proposing a personal-preference
        // change is suppressed here.
        allowPreferenceLearning: false,
      },
    );

    if (result.kind === "declined" || result.kind === "clarify" || result.kind === "ungrounded") {
      const message = await writeRepo.append(tripId, {
        userId: null,
        role: "assistant",
        kind: "text",
        content: result.content,
        metadata: { ...result.meta, replyToMessageId: target.id },
        idempotencyKey,
      });
      invalidateWorkspace(tripId);
      // No COMPOSE call on this path, but it still deserves a trace — this route used to return
      // here with none at all, so an "ungrounded" reply (e.g. "@Roam where can we go in
      // montreal" coming back "couldn't verify anything") left zero record of what RESOLVE
      // planned or which providers failed, impossible to diagnose after the fact. Matches the
      // personal /api/ai route's identical handling of this same three-way outcome.
      const declinedResult = result;
      const usage: UsageEntry[] = declinedResult.usage.length
        ? declinedResult.usage
        : [{ model: declinedResult.resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined), promptTokens: estimateTokens(target.content), completionTokens: estimateTokens(declinedResult.content) }];
      const tokensIn = usage.reduce((sum, u) => sum + u.promptTokens, 0);
      const tokensOut = usage.reduce((sum, u) => sum + u.completionTokens, 0);
      const cost = Number(sumCostUsd(usage).toFixed(5));
      after(() =>
        recordAiTurn(supabase, tripId, {
          intent: declinedResult.resolved.intent,
          tools: declinedResult.kind === "ungrounded" ? declinedResult.toolsUsed : [],
          providers_failed: declinedResult.kind === "ungrounded" ? declinedResult.providersFailed : [],
          blocks: declinedResult.meta.blocks.map((block) => block.type),
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: cost,
          resolve_ms: declinedResult.timings.resolveMs,
          retrieve_ms: declinedResult.timings.retrieveMs,
          compose_ms: 0,
          total_ms: Math.round(performance.now() - t0),
          model_resolve: declinedResult.resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined),
          degraded: Boolean(declinedResult.resolved.degraded),
        }),
      );
      return NextResponse.json({ message }, { status: 201 });
    }

    // --- COMPOSE (buffered, bounded tool-calling loop) ------------------------
    const { system, composeSkipLine, composeTools, toolEvidence, allowedUrls, toolPlan, evidenceUnavailableProviders, cardPlaceProviderIds, sideBuilders, resolved } = result;
    const tCompose = performance.now();
    let composedModel: string | undefined;
    let composeUsage: { inputTokens?: number; outputTokens?: number } | undefined;
    let rawText: string;
    if (composeSkipLine) {
      rawText = composeSkipLine;
    } else {
      const messages = compactAiMessages(turns, 12, 12_000);
      const chain = composeModelChain();
      rawText = await withTripAiTask(tripId, user.id, async () => {
        let lastError: unknown;
        for (let i = 0; i < chain.length; i += 1) {
          const entry = chain[i];
          try {
            const generated = await generateText({
              model: entry.model,
              system,
              messages,
              tools: composeTools,
              stopWhen: stepCountIs(COMPOSE_MAX_STEPS),
              // Only the LAST provider in the chain (nowhere left to fail over to) gets the full
              // buffered budget — an earlier attempt that's merely stalled (not actually down)
              // used to cost the user the entire 60s before this route would even try the next
              // model, worse than the streaming path's tiered time-to-first-token fallback.
              abortSignal: withDeadline(request.signal, i < chain.length - 1 ? AI_DEADLINE_MS.composeBufferedFallback : AI_DEADLINE_MS.composeBuffered),
              ...(entry.providerOptions ? { providerOptions: entry.providerOptions } : {}),
            });
            composedModel = entry.modelId;
            composeUsage = generated.usage;
            return generated.text;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            lastError = error;
            logger.warn({ err: error, attempt: i }, "group-chat compose model failed, trying next in chain");
          }
        }
        throw lastError ?? new Error("compose produced no model");
      });
    }
    const text = stripReasoning(rawText);

    // Phase 3.2.2 mitigation (b) (docs/overhaul/roadmap/phase-3-accuracy.md): this route is
    // buffered (nothing streamed to the client yet at this point), so side-builders and the
    // grounding evaluator — neither depends on the other's result, both only need `text` /
    // already-in-flight promises — can simply run together instead of one after the other.
    // Phase 3.2 (docs/overhaul/roadmap/phase-3-accuracy.md): regex sanitizer + the grounding
    // evaluator, same as the personal /api/ai route — tracked separately from `composeEntry`
    // below so the per-model cost trace still attributes tokens to whichever model answered each.
    let evaluatorUsage: UsageEntry | undefined;
    let unverified = false;
    const [[checklist, comparison], sanitized] = await Promise.all([
      Promise.all([sideBuilders.checklistPromise, sideBuilders.comparisonPromise]),
      finalizeAssistantText(text, allowedUrls, system, request.signal, (entry) => { evaluatorUsage = entry; }, resolved.intent, () => { unverified = true; }),
    ]);
    const meta = { ...finalizeAssistantBlocks(result.meta, { checklist, comparison }, cardPlaceProviderIds), ...(unverified ? { unverified: true } : {}) };

    const message = await writeRepo.append(tripId, {
      userId: null,
      role: "assistant",
      kind: "text",
      content: sanitized,
      metadata: { ...meta, replyToMessageId: target.id },
      idempotencyKey,
    });
    invalidateWorkspace(tripId);

    const composeMs = Math.round(performance.now() - tCompose);
    const totalMs = Math.round(performance.now() - t0);
    // Same fix as the personal /api/ai route: price every stage (RESOLVE + bulk block-builders,
    // tracked in result.usage) by the model that actually answered it, plus COMPOSE's own real
    // usage when the provider reported one — falling back to a char/4 estimate priced off the
    // model that actually composed (not the blindly-configured AI_MODEL) only when it didn't.
    const composeEntry: UsageEntry = composeUsage
      ? { model: composedModel, promptTokens: composeUsage.inputTokens ?? 0, completionTokens: composeUsage.outputTokens ?? 0 }
      : { model: composedModel ?? (process.env.AI_MODEL || undefined), promptTokens: estimateTokens(system), completionTokens: estimateTokens(sanitized) };
    const allUsage: UsageEntry[] = [...result.usage, composeEntry, ...(evaluatorUsage ? [evaluatorUsage] : [])];
    const tokensIn = allUsage.reduce((sum, u) => sum + u.promptTokens, 0);
    const tokensOut = allUsage.reduce((sum, u) => sum + u.completionTokens, 0);
    const cost = Number(sumCostUsd(allUsage).toFixed(5));
    const toolsUsed = [...new Set([...toolPlan.map((call) => call.tool), ...toolEvidence.usedTools])];
    const providersFailed = [...new Set([...evidenceUnavailableProviders, ...toolEvidence.unavailableProviders])];
    // Best-effort trace write (recordAiTurn already swallows its own errors) — via after(), not
    // a bare fire-and-forget, so the platform keeps this request alive long enough for the write
    // to actually land instead of racing a serverless teardown right after the reply is sent.
    after(() =>
      recordAiTurn(supabase, tripId, {
        intent: resolved.intent,
        tools: toolsUsed,
        providers_failed: providersFailed,
        blocks: meta.blocks.map((block) => block.type),
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: cost,
        resolve_ms: result.timings.resolveMs,
        retrieve_ms: result.timings.retrieveMs,
        compose_ms: composeMs,
        total_ms: totalMs,
        model_resolve: resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined),
        model_compose: composedModel,
        degraded: Boolean(resolved.degraded),
      }),
    );

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Roam is unavailable right now");
  }
}
