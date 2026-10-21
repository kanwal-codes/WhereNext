import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { loadTripContext, formatTripMemory, describeMembers, formatExpenses } from "@/lib/application/trip-context";
import { loadTravellerDefaults, withTravellerDefaults } from "@/lib/server/traveller-defaults";
import { runAssistantTurn, finalizeAssistantBlocks } from "@/lib/application/orchestrate/run-turn";
import { composeModelChain } from "@/packages/ai/compose-model";
import { DAILY_TRIP_TURN_LIMIT, DAILY_TURN_LIMIT } from "@/packages/ai/model-policy";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { compactAiMessages } from "@/packages/contracts/ai-request";
import { stripReasoning } from "@/lib/ai/strip-reasoning";
import { finalizeAssistantText } from "@/lib/application/evaluator";
import { withTripAiTask } from "@/lib/server/trip-ai-queue";
import { recordAiTurn } from "@/lib/server/ai-turn-trace";
import type { UsageEntry } from "@/lib/ai/pricing";
import { logger } from "@/lib/server/logger";
import { composeBuffered, type BufferedCompose } from "@/lib/server/compose-buffered";
import { surfacedEarlierFrom } from "@/lib/application/orchestrate/thread-history";
import { composedTrace, earlyExitTrace } from "@/features/group-chat/application/roamTurnTrace";
import { createGroupChatRepository } from "@/features/group-chat/infrastructure/groupChatRepository";
import { historyThrough, mentionsRoam } from "@/features/group-chat/domain/message";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { tripMemberIdentities } from "@/lib/server/trip-member-identities";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

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
export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const tEnter = performance.now();
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId, { registered: true });
    const repo = createGroupChatRepository(supabase);
    // Roam's own rows are written through the service-role client — regular members' sessions
    // are RLS-restricted to role='user' inserts (see migration 0027), so a request-scoped client
    // can't write an assistant row even if this handler tried to.
    const adminClient = createSupabaseAdminClient();
    const writeRepo = createGroupChatRepository(adminClient);

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

    const [loadedCtx, defaults, history, names] = await Promise.all([
      loadTripContext(supabase, tripId),
      loadTravellerDefaults(supabase, user.id, request.headers),
      repo.list(tripId, user.id, { limit: HISTORY_LIMIT }),
      memberNames(tripId),
    ]);

    const tripCtx = { ...loadedCtx, preferences: withTravellerDefaults(loadedCtx.preferences, defaults) };

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
    // A reply Roam wrote without its planner (degraded: nothing was looked up) is not worth protecting: asking again recomputes it onto the same row.
    if (existingReply && !(existingReply.metadata as { degraded?: boolean } | null)?.degraded) return NextResponse.json({ message: existingReply }, { status: 200 });

    // Chat-completion messages have no per-speaker field, so a human turn folds the sender's
    // name into its content ("Alex: ...") — Roam's own prior replies stay plain "assistant" turns.
    // `prompt` (fed to RESOLVE) stays the raw, unprefixed text of the message that mentioned Roam.
    // Only up to the message being answered: with several members asking at once, later messages in `history` are
    // other people's questions, and the newest user turn is what COMPOSE answers (see `historyThrough`).
    const turns = historyThrough(history, target)
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
    const surfacedEarlier = surfacedEarlierFrom(history);

    // The trip's facts plus who is on it ("who are the travellers?" is answered from this).
    const identityEntries: Array<[string, { name: string }]> = [...names].map(([id, name]) => [id, { name }]);
    const membersLine = describeMembers(identityEntries, user.id);
    const summaryOf = (ctx: typeof tripCtx) => [formatTripMemory(ctx), membersLine, formatExpenses(ctx.localExpenses, ctx.localBalances, identityEntries, user.id)].filter(Boolean).join(" ");
    const t0 = performance.now();
    // The trace's total_ms starts here, so a slow auth / limiter / context load before this point is otherwise invisible.
    logger.info({ tripId, preRunMs: Math.round(t0 - tEnter) }, "group-chat roam: starting the turn");
    const result = await runAssistantTurn(
      { supabase, tripId },
      {
        tripCtx, prompt: target.content, history: turns, tripSummary: summaryOf(tripCtx), deriveTripSummary: summaryOf, signal: request.signal,
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
      const trace = earlyExitTrace(result, target.content, Math.round(performance.now() - t0));
      after(() => recordAiTurn(adminClient, tripId, trace));
      return NextResponse.json({ message }, { status: 201 });
    }

    // --- COMPOSE (buffered, bounded tool-calling loop) ------------------------
    const { composeSkipIsLeadIn, system, composeSkipLine, composeTools, allowedUrls, sideBuilders, resolved } = result;
    const tCompose = performance.now();
    let composedModel: string | undefined;
    let composeUsage: BufferedCompose["usage"];
    let rawText: string;
    if (composeSkipLine) {
      rawText = composeSkipLine;
    } else {
      const composed = await withTripAiTask(tripId, user.id, () =>
        composeBuffered({ chain: composeModelChain(), system, messages: compactAiMessages(turns, 12, 12_000), tools: composeTools, signal: request.signal }),
      );
      rawText = composed.text;
      composedModel = composed.modelId;
      composeUsage = composed.usage;
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
      // A deterministic card lead-in has no claims or links to check: skip the grounding model call.
      composeSkipIsLeadIn ? Promise.resolve(text) : finalizeAssistantText(text, allowedUrls, system, request.signal, (entry) => { evaluatorUsage = entry; }, resolved.intent, () => { unverified = true; }, turns.filter((t) => t.role === "user").map((t) => t.content).join("\n")),
    ]);
    const meta = { ...finalizeAssistantBlocks(result.meta, { checklist, comparison }), ...(unverified ? { unverified: true } : {}) };

    const message = await writeRepo.append(tripId, {
      userId: null,
      role: "assistant",
      kind: "text",
      content: sanitized,
      metadata: { ...meta, replyToMessageId: target.id },
      idempotencyKey,
    });
    invalidateWorkspace(tripId);

    const trace = composedTrace(result, { meta, sanitized, composedModel, composeUsage, evaluatorUsage, composeMs: Math.round(performance.now() - tCompose), totalMs: Math.round(performance.now() - t0) });
    // Best-effort trace write (recordAiTurn already swallows its own errors) — via after(), not
    // a bare fire-and-forget, so the platform keeps this request alive long enough for the write
    // to actually land instead of racing a serverless teardown right after the reply is sent.
    after(() => recordAiTurn(adminClient, tripId, trace));

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    // A request the client gave up on is not Roam breaking: answer quietly (nobody is listening) instead of logging an error.
    if (request.signal.aborted) return new NextResponse(null, { status: 499 });
    return tripAuthResponse(error) ?? fail(error, "Roam is unavailable right now");
  }
});
