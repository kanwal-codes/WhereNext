import { NextResponse } from "next/server";
import { streamText, stepCountIs } from "ai";
import { createReasoningGate } from "@/lib/ai/strip-reasoning";
import { aiRequestSchema, compactAiMessages } from "@/packages/contracts/ai-request";
import type { AssistantTurnMeta } from "@/packages/contracts/assistant";
import { composeModelChain } from "@/packages/ai/compose-model";
import { AI_DEADLINE_MS, COMPOSE_MAX_STEPS, withDeadline } from "@/packages/ai/model-policy";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail, withRoute } from "@/lib/server/with-route";
import { logger } from "@/lib/server/logger";
import { estimateTokens, sumCostUsd, type UsageEntry } from "@/lib/ai/pricing";
import { loadTripContext, formatTripMemory, describeMembers, formatExpenses, type TripContext } from "@/lib/application/trip-context";
import { tripMemberIdentities } from "@/lib/server/trip-member-identities";
import { loadTravellerDefaults, withTravellerDefaults } from "@/lib/server/traveller-defaults";
import { runAssistantTurn, finalizeAssistantBlocks, type AssistantTurnResult } from "@/lib/application/orchestrate/run-turn";
import { lastSuggestedFollowups, modelHistory, surfacedEarlierFrom } from "@/lib/application/orchestrate/thread-history";
import { SSE_HEADERS, doneFrame, isAbortError, progressFrame, textFrame, toolProgressLabel, truncatedFrame } from "@/lib/server/ai-stream-frames";
import { turnLimitRefusal } from "@/lib/server/ai-turn-limits";
import { refreshThreadSummary } from "@/lib/application/thread-summary";
import { persistedAssistantStream } from "@/features/conversation/application/persistedAssistantStream";
import { createConversationRepository } from "@/features/conversation/infrastructure/conversationRepository";
import { withPrunedFollowups } from "@/lib/application/followups";
import { finalizeAssistantText } from "@/lib/application/evaluator";
import { withTripAiStream } from "@/lib/server/trip-ai-queue";
import { recordAiTurn } from "@/lib/server/ai-turn-trace";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Service-role writer used to create a brand-new trip's thread row and to append turn traces
 *  (ai_turn_traces is server-write-only since migration 0047); undefined if unavailable (same
 *  fallback the /conversation route itself uses). */
function threadWriter() {
  try {
    return createSupabaseAdminClient();
  } catch {
    return undefined;
  }
}

export const POST = withRoute(async function POST(request: Request) {
  const parsed = aiRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid AI request" }, { status: 400 });
  const { tripId } = parsed.data;

  let supabase: SupabaseClient;
  let userId: string;
  let guest: boolean;
  try {
    ({ supabase, user: { id: userId }, guest } = await requireTripMember(tripId));
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Assistant unavailable");
  }

  const refusal = await turnLimitRefusal({ request, userId, tripId, guest });
  if (refusal) return refusal;

  const prompt = parsed.data.messages.at(-1)?.content ?? "";

  // Persisting the user's message used to be a separate round trip the client made to
  // /conversation before ever calling here — purely so this route could verify it had already
  // landed. Doing it here instead, as this route's first action, removes that whole extra
  // network hop from every message send. The idempotency key makes this safe to call even if
  // something upstream (an e2e script, a retry) also persists the same message separately —
  // it upserts onto the same row rather than duplicating it.
  // Saving the question and reading the trip's context do not depend on each other, so they run together (the context
  // used to wait for the save). Only the stored transcript, which must include this question, waits for it.
  const contextLoad = Promise.all([
    loadTripContext(supabase, tripId),
    loadTravellerDefaults(supabase, userId, request.headers),
    supabase.from("conversation_threads").select("summary").eq("trip_id", tripId).eq("user_id", userId).maybeSingle(),
    // Who is on the trip, so "who are the travellers?" can be answered (best effort: names only improve an answer).
    tripMemberIdentities(tripId).catch(() => new Map<string, { email: string | null; name: string }>()),
  ]);
  contextLoad.catch(() => undefined); // awaited below; this only keeps a failure from being reported as unhandled while the save is awaited
  try {
    await createConversationRepository(supabase, threadWriter()).append(tripId, userId, {
      role: "user",
      content: prompt,
      idempotencyKey: parsed.data.messageIdempotencyKey,
    });
  } catch (error) {
    return fail(error, "Your message didn't send");
  }

  try {
    const [[loadedCtx, defaults, threadRow, memberIdentities], storedMessages] = await Promise.all([
      contextLoad,
      // The UI can page the full durable thread; model context stays bounded and is supplemented
      // by the thread summary so a long-running trip does not balloon every AI request.
      // ponytail: 60 not 200 — COMPOSE only ever uses the last 12 (compactAiMessages below) and
      // RESOLVE the last 8; the rest of this fetch exists solely to rebuild `surfacedEarlier` from
      // each message's card metadata. 60 keeps that repeat-avoidance useful for the visible recent
      // conversation without pulling a long trip's entire history (with full block payloads) on
      // every single turn. If repeats from further back become a real complaint, persist
      // `surfacedEarlier` incrementally instead of raising this number.
      createConversationRepository(supabase).list(tripId, userId, { limit: 60 }),
    ]);
    // The trip's own language / country / currency win; this traveller's defaults fill the gaps.
    const tripCtx = { ...loadedCtx, preferences: withTravellerDefaults(loadedCtx.preferences, defaults) };
    // The writer slices to 600 chars, but the row is member-writable; clamp on read as well.
    const threadSummary = ((threadRow.data?.summary as string | null) ?? "").slice(0, 600);
    const membersLine = describeMembers(memberIdentities, userId);
    const expensesOf = (ctx: TripContext) => formatExpenses(ctx.localExpenses, ctx.localBalances, memberIdentities, userId);
    const tripSummary = [formatTripMemory(tripCtx), membersLine, expensesOf(tripCtx), threadSummary && `Earlier in this conversation: ${threadSummary}`].filter(Boolean).join(" ");
    const viewContext = parsed.data.viewContext;
    // conversationRepository.append() scopes this by role itself (scopedMessageIdempotencyKey) —
    // matching the raw, unprefixed key the "user" append call above already passes, so the
    // client can deterministically predict the stored key from the same raw value it generated.
    const idempotencyKey = parsed.data.messageIdempotencyKey;

    const modelMessages = modelHistory(storedMessages);
    const surfacedEarlier = surfacedEarlierFrom(storedMessages);

    // Per-turn trace timing + token accounting (COMPOSE usage arrives late, via the stream sniffer).
    const t0 = performance.now();
    let tokensIn = 0;
    let tokensOut = 0;
    // Which model in the COMPOSE fallback chain actually produced the streamed prose —
    // undefined when a structured block's own intro answered the turn (COMPOSE never ran).
    let composedModel: string | undefined;
    let composeMs: number | undefined;
    // Phase 3.2 (docs/overhaul/roadmap/phase-3-accuracy.md): the grounding evaluator's own bulk-
    // role usage — tracked separately from tokensIn/tokensOut (COMPOSE's own) so the per-model
    // cost trace below still attributes tokens to whichever model actually answered each call.
    let evaluatorUsage: UsageEntry | undefined;
    // Set by `finalizeAssistantText`'s `onUnverified` callback below, read by the `meta` thunk
    // once `sanitize` (the same call) has resolved — same outer-variable pattern as
    // `evaluatorUsage` just above, for the same reason (the two run concurrently, not one
    // returning into the other).
    let unverified = false;
    let evaluatorSettled: Promise<string> | undefined;
    // Set once `runAssistantTurn` resolves, inside the stream below — the Response (and this
    // stream) is now returned BEFORE that await, so a client sees real progress during RESOLVE/
    // RETRIEVE (Phase 2.6.2) instead of a silent wait. Every reader of `result` here runs only
    // after the stream has fully drained (persistedAssistantStream's own completion callbacks),
    // by which point it is always set on every non-error path.
    let result: AssistantTurnResult | undefined;
    // declined/clarify/ungrounded's trace shape (no COMPOSE call on that path); "ungrounded"
    // populates the real values, everything else keeps these empty defaults.
    let toolsForTrace: string[] = [];
    let providersFailedForTrace: string[] = [];
    // The meta actually persisted + sent on the final SSE frame — for "ready", this is
    // `result.meta` PLUS the checklist/comparison/actions blocks `finalizeAssistantBlocks` folds
    // in, which need `sideBuilders` awaited first. Computed here (inside the stream, before it
    // closes) rather than inside `onComplete` below: persistedAssistantStream reads its lazy
    // `meta` thunk BEFORE awaiting `onComplete`, so anything the thunk needs must already be a
    // plain value by the time the stream finishes draining, not still pending inside that callback.
    let finalMeta: AssistantTurnMeta | undefined;

    // The client can disconnect (tab closed, navigation, a dropped connection) at any point
    // while this is running. The platform then cancels the Response stream returned below — but
    // that's `persistedAssistantStream`'s wrapper, not `body` directly, and by itself a
    // `ReadableStream` doesn't interrupt its own still-running `start()` just because its reader
    // was cancelled. `request.signal` is threaded through RESOLVE/RETRIEVE/COMPOSE's own model
    // calls already and handles most of this — but it's a SEPARATE mechanism from the platform
    // cancelling the stream, and nothing guarantees the two always fire together or in time. This
    // controller is `body`'s own `cancel()` handler below firing — the one signal that's
    // guaranteed to reflect the platform's own view that the client is gone, independent of
    // whether `request.signal` cooperates. Both are raced together wherever it matters.
    const disconnectController = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        // A stale write after disconnect must be a harmless no-op, not an uncaught "Controller is
        // already closed" TypeError that would abandon whatever cleanup runs after it (see the
        // forwarding loop below).
        let clientGone = false;
        const safeEnqueue = (chunk: Uint8Array) => {
          if (clientGone) return;
          try { controller.enqueue(chunk); } catch { clientGone = true; }
        };
        const safeClose = () => {
          if (clientGone) return;
          try { controller.close(); } catch { /* already closed/errored — nothing left to do */ }
        };
        // Covers both abort sources everywhere downstream needs to actually stop work on
        // disconnect — a platform-driven cancel (`disconnectController`, fired from `cancel()`
        // below) doesn't cooperatively propagate through `request.signal` on its own, so RESOLVE/
        // RETRIEVE and each COMPOSE attempt need this combined signal, not just `request.signal`,
        // or a disconnect mid-RESOLVE/RETRIEVE/COMPOSE leaves the provider call running orphaned
        // (nobody reading its output) until it completes or times out on its own.
        const combinedAbort = AbortSignal.any([request.signal, disconnectController.signal]);
        try {
          safeEnqueue(progressFrame("resolve"));
          result = await runAssistantTurn(
            { supabase, tripId },
            {
              tripCtx, prompt, history: modelMessages, tripSummary, viewContext, surfacedEarlier, signal: combinedAbort,
              deriveTripSummary: (ctx) => [formatTripMemory(ctx), membersLine, expensesOf(ctx), threadSummary && `Earlier context (current trip facts take precedence): ${threadSummary}`].filter(Boolean).join(" "),
              onRetrieveStart: (tools) => safeEnqueue(progressFrame("retrieve", toolProgressLabel(tools))),
            },
          );

          // --- OUT OF SCOPE / CLARIFY / UNGROUNDED -----------------------------
          // No connection to travel or this trip, a genuine ambiguity, or nothing came back from
          // RETRIEVE for a plan that needed grounding — decline/ask/apologise in one line and stop.
          if (result.kind === "declined" || result.kind === "clarify" || result.kind === "ungrounded") {
            if (result.kind === "ungrounded") {
              toolsForTrace = result.toolsUsed;
              providersFailedForTrace = result.providersFailed;
            }
            finalMeta = result.meta;
            safeEnqueue(textFrame(result.content));
            safeEnqueue(doneFrame);
            safeClose();
            return;
          }

          // --- COMPOSE (bounded tool-calling loop) -----------------------------
          const { system, composeSkipLine, composeTools } = result;
          safeEnqueue(progressFrame("compose"));
          if (composeSkipLine) {
            // Side-builders still ran (they start before COMPOSE regardless of composeSkipLine) —
            // their blocks belong on this reply too. Building `finalMeta` here used to block the
            // stream from closing until they finished; now the stream closes immediately and the
            // lazy `meta` thunk passed to `persistedAssistantStream` below awaits them instead, so
            // that wait overlaps with the grounding evaluator's own call instead of stacking in
            // front of it (Phase 3.2.2 mitigation, docs/overhaul/roadmap/phase-3-accuracy.md).
            safeEnqueue(textFrame(composeSkipLine));
            safeEnqueue(doneFrame);
            safeClose();
            return;
          }

          const tCompose = performance.now();
          const composeChain = composeModelChain();
          // `withTripAiStream` throttles/queues per (trip, user) and doesn't release its slot
          // until the stream ITS OWN caller returns is fully drained — so the model-selection
          // loop still has to run inside `task()` and return a stream, exactly as before; only
          // now that stream is a private inner one, forwarded chunk-by-chunk into the outer
          // `controller` below instead of being the Response body directly.
          const queuedStream = await withTripAiStream(tripId, userId, async () => {
            // Try the primary model, then each fallback, until one produces its first chunk.
            let iterator: AsyncIterator<string> | undefined;
            let firstChunk: IteratorResult<string> | undefined;
            let lastError: unknown;
            // A stalled provider must not hang the turn: cap time-to-first-token per attempt
            // (move to the next model in the chain), and cap the whole stream well above any
            // real answer length.
            const withTtft = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
              let timer: ReturnType<typeof setTimeout> | undefined;
              const deadline = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("compose time-to-first-token exceeded")), ms);
              });
              return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
            };
            for (let i = 0; i < composeChain.length; i += 1) {
              const entry = composeChain[i];
              // Own controller per attempt: a TTFT timeout below only rejects the local race, it
              // doesn't touch the streamText call itself — without aborting here, a stalled
              // provider that's merely slow (not actually down) keeps running its tool-calling
              // loop against real paid APIs in the background after the route has already moved
              // to the next provider, uncounted by the turn's rate limit or cost trace.
              const attemptController = new AbortController();
              const streamResult = streamText({
                model: entry.model,
                system,
                messages: compactAiMessages(modelMessages, 12, 12_000),
                tools: composeTools,
                stopWhen: stepCountIs(COMPOSE_MAX_STEPS),
                abortSignal: AbortSignal.any([attemptController.signal, withDeadline(combinedAbort, 60_000)]),
                onError: ({ error }) => {
                  if (isAbortError(error)) return; // ordinary disconnect/timeout, not a real failure
                  logger.error({ err: error }, "compose stream error");
                },
                ...(entry.providerOptions ? { providerOptions: entry.providerOptions } : {}),
              });
              try {
                const it = streamResult.textStream[Symbol.asyncIterator]();
                // Earlier attempts still have a fallback to move to, so they get a shorter leash —
                // only the last provider in the chain (nowhere left to fail over to) waits the
                // full, generous timeout.
                const ttft = i < composeChain.length - 1 ? AI_DEADLINE_MS.composeTtftFallback : AI_DEADLINE_MS.composeTtft;
                firstChunk = await withTtft(it.next(), ttft);
                iterator = it;
                composedModel = entry.modelId;
                void streamResult.totalUsage.then(
                  (u) => { tokensIn += u.inputTokens ?? 0; tokensOut += u.outputTokens ?? 0; },
                  () => undefined,
                );
                break;
              } catch (error) {
                if (isAbortError(error)) throw error;
                lastError = error;
                attemptController.abort();
                logger.warn({ err: error, attempt: i }, "compose model failed, trying next in chain");
              }
            }
            if (!iterator || !firstChunk) throw lastError ?? new Error("compose produced no model");

            // Hold reasoning-model scratchpad (harmony analysis channel, <think> blocks) back
            // from the live stream — it would otherwise flash on screen before the final settle
            // strips it.
            const gate = createReasoningGate();
            return new ReadableStream<Uint8Array>({
              async start(innerController) {
                const emit = (raw: string) => {
                  const clean = gate(raw);
                  if (clean) innerController.enqueue(textFrame(clean));
                };
                try {
                  if (!firstChunk!.done && firstChunk!.value) emit(firstChunk!.value);
                  for (;;) {
                    const chunk = await iterator!.next();
                    if (chunk.done) break;
                    if (chunk.value) emit(chunk.value);
                  }
                } catch (error) {
                  if (!isAbortError(error)) logger.error({ err: error }, "compose stream ended early");
                  // Signal this to persistedAssistantStream so the partial text gets flagged
                  // rather than persisted and replayed as if it were a genuinely complete answer.
                  innerController.enqueue(truncatedFrame());
                }
                innerController.close();
              },
            });
          });
          // A disconnect must actively interrupt this loop, not just wait for it to notice on its
          // own — `queuedStream` is backed by a real provider call that may not stop producing
          // chunks for a while, and until *something* reads `queuedStream` to a `done`/cancelled
          // state, `withTripAiStream`'s per-(trip, user) queue slot below is never released —
          // silently wedging every future turn for that user on that trip. Race every read
          // against BOTH disconnect signals (set up once, not per-chunk, to avoid piling up
          // listeners) — `request.signal` covers a cooperative abort that's already propagated
          // into the model call itself; `disconnectController` covers the platform cancelling
          // this stream directly, which doesn't depend on that propagation happening at all.
          const disconnectSignal = new Promise<never>((_, reject) => {
            const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
            if (combinedAbort.aborted) onAbort();
            else combinedAbort.addEventListener("abort", onAbort, { once: true });
          });
          const queuedReader = queuedStream.getReader();
          try {
            for (;;) {
              const chunk = await Promise.race([queuedReader.read(), disconnectSignal]);
              if (chunk.done) break;
              safeEnqueue(chunk.value);
            }
          } finally {
            // Always — normal completion, a disconnect, or any other throw. Cancelling a reader
            // that already reached `done` is a harmless no-op; cancelling one that's still
            // mid-stream is what actually releases the queue slot (via `withTripAiStream`'s own
            // `cancel()` handler in `lib/server/trip-ai-queue.ts`).
            await queuedReader.cancel().catch(() => undefined);
          }
          composeMs = Math.round(performance.now() - tCompose);
          // Closes now, not after awaiting side-builders — see the composeSkipLine branch above
          // for why (same Phase 3.2.2 mitigation, same lazy `meta` thunk below does the wait).
          safeEnqueue(doneFrame);
          safeClose();
        } catch (error) {
          if (isAbortError(error)) {
            try { controller.error(error); } catch { /* already closed/errored */ }
            return;
          }
          // RESOLVE/RETRIEVE (or the queue slot itself) failed outside any of runAssistantTurn's
          // own internal safety nets — this response has already committed to a stream (Phase
          // 2.6.2 opens it before that await), so there's no clean status code left to fall back
          // to. Degrade in-band instead, the same way a COMPOSE-stream failure already does above.
          logger.error({ err: error }, "assistant turn failed after the stream had already opened");
          finalMeta = finalMeta ?? result?.meta ?? { language: "en", locationFocus: null, surface: "chat", blocks: [], sources: [], suggestedFollowups: [], unavailableProviders: [] };
          safeEnqueue(textFrame("Roam is unavailable right now. Try again in a moment."));
          safeEnqueue(truncatedFrame());
          safeEnqueue(doneFrame);
          safeClose();
        }
      },
      // The platform calls this when the client disconnects (via `persistedAssistantStream`'s own
      // `cancel()` cancelling `body`'s reader) — the signal `disconnectController` above exists to
      // carry into the forwarding loop, since a `ReadableStream`'s own `cancel()` algorithm has no
      // other way to reach back into its already-running `start()`.
      cancel(reason) {
        disconnectController.abort(reason);
      },
    });

    return new Response(
      persistedAssistantStream(
        body, supabase, tripId, userId, idempotencyKey,
        // `disconnectController` (declared above, outside `start()`) is the same platform-driven
        // disconnect signal `combinedAbort` inside `start()` is built from — this callback runs
        // outside that closure, so it's combined again here rather than reused. Without this, a
        // platform disconnect during the (up to ~2.5s) evaluator call would only ever be caught by
        // its own wall-clock guard, never interrupted early, unlike every other model call in this
        // route.
        (content) => {
          // A deterministic card lead-in has no claims or links to check: skip the grounding call (up to ~2.5 s before the cards show).
          if (result?.kind !== "ready" || result.composeSkipIsLeadIn) return content;
          const p = finalizeAssistantText(
            content, result.allowedUrls, result.system, AbortSignal.any([request.signal, disconnectController.signal]),
            (entry) => { evaluatorUsage = entry; }, result.resolved.intent, () => { unverified = true; },
            parsed.data.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n"),
          );
          // Read by the `meta` thunk below so it can wait for this exact call to settle before
          // reading `unverified` — `sanitize` and `meta` run concurrently (Promise.all in
          // persistedAssistantStream), so without this the flag could still be `false` at the
          // moment `meta` finishes, if the evaluator happens to still be in flight then.
          evaluatorSettled = p;
          return p;
        },
        // Lazy, and now possibly async (Phase 3.2.2 mitigation,
        // docs/overhaul/roadmap/phase-3-accuracy.md): `finalMeta` is already a plain value by the
        // time this runs for declined/clarify/ungrounded (set synchronously above, no side-
        // builders on that path). For "ready" (composeSkipLine or a full COMPOSE stream), the
        // stream now closes as soon as the text is final WITHOUT waiting for side-builders first
        // — this thunk does that wait itself, so `persistedAssistantStream`'s `Promise.all` runs
        // it at the same time as the grounding evaluator's own call instead of one stacked after
        // the other.
        async () => {
          if (!finalMeta && result?.kind === "ready") {
            const [checklist, comparison] = await Promise.all([result.sideBuilders.checklistPromise, result.sideBuilders.comparisonPromise]);
            finalMeta = finalizeAssistantBlocks(result.meta, { checklist, comparison });
          }
          // Waits for the SAME `sanitize` call above, not a fresh one — side-builders above
          // usually take longer than the evaluator's own bounded (≤2.5s) deadline, so this
          // rarely adds real latency; it only ever blocks the rare turn where side-builders
          // finish first, and even then by at most the evaluator's own deadline.
          const replyText = await evaluatorSettled;
          const previous = lastSuggestedFollowups(storedMessages);
          const pruned = finalMeta && typeof replyText === "string" ? withPrunedFollowups(finalMeta, replyText, previous) : finalMeta;
          return pruned && unverified ? { ...pruned, unverified: true } : pruned;
        },
        async (finalText) => {
          if (!result) return;
          const totalMs = Math.round(performance.now() - t0);
          if (result.kind !== "ready") {
            // No COMPOSE call on this path (declined/clarify/ungrounded) — RESOLVE's own usage is
            // already in result.usage; fall back to the old char/4 estimate only if RESOLVE itself
            // never reported usage (e.g. both attempts failed and this is the degraded default).
            const usage: UsageEntry[] = result.usage.length
              ? result.usage
              // RESOLVE's own env override, if any — never AI_MODEL (that's COMPOSE's), which
              // would mislabel a fully-degraded RESOLVE with a model it never even attempted.
              : [{ model: result.resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined), promptTokens: estimateTokens(prompt), completionTokens: estimateTokens(finalText) }];
            tokensIn = usage.reduce((sum, u) => sum + u.promptTokens, 0);
            tokensOut = usage.reduce((sum, u) => sum + u.completionTokens, 0);
            const cost = Number(sumCostUsd(usage).toFixed(5));
            // Fire-and-forget, NOT `after()` — confirmed live (2026-09-16) that `after()`'s
            // queued callback never actually runs for this route: its own internal
            // `runCallbacksOnClose` waits for the platform's "response closed" signal, which
            // never fires for this route's custom streaming `ReadableStream` Response (verified
            // by comparing against `group-chat/roam/route.ts`'s buffered `NextResponse.json`
            // response, whose identical `after(() => recordAiTurn(...))` call DOES write a row).
            // Both callees already swallow their own errors (best-effort, never throws) — a bare
            // call risks losing the write if the platform tears the process down instantly after
            // the response finishes, the exact race `after()` was meant to avoid, but that's
            // strictly better than the current 100%-guaranteed silent no-op.
            void recordAiTurn(threadWriter() ?? supabase, tripId, {
              intent: result!.resolved.intent,
              tools: toolsForTrace,
              providers_failed: providersFailedForTrace,
              blocks: (finalMeta ?? result!.meta).blocks.map((block) => block.type),
              tokens_in: tokensIn,
              tokens_out: tokensOut,
              cost_usd: cost,
              resolve_ms: result!.timings.resolveMs,
              retrieve_ms: result!.timings.retrieveMs,
              total_ms: totalMs,
              model_resolve: result!.resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined),
              degraded: Boolean(result!.resolved.degraded),
            });
            void refreshThreadSummary(supabase, tripId, userId);
            return;
          }

          const { toolEvidence, toolPlan, evidenceUnavailableProviders, resolved } = result;
          // Already computed (including the side-builder blocks) inside the stream above, before
          // it closed — see `finalMeta`'s own doc comment for why that has to happen there.
          const meta = finalMeta ?? result.meta;
          // A local fake / Cerebras may not report usage — fall back to a char/4 estimate.
          if (!tokensIn) tokensIn = estimateTokens(result.system);
          if (!tokensOut) tokensOut = estimateTokens(finalText);
          // Price the WHOLE turn, not just COMPOSE: RESOLVE and every bulk block-builder (itinerary,
          // budget, comparison, checklist, ...) ran their own model call and is tracked in
          // result.usage, tagged with whichever model actually answered it — summing per-entry cost
          // (instead of pricing the turn off one blended `process.env.AI_MODEL` string) is what makes
          // this number trustworthy when the fallback chain, or a bulk builder's own Gemini-first
          // routing, didn't use the configured primary model.
          const allUsage: UsageEntry[] = [...result.usage, { model: composedModel ?? (process.env.AI_MODEL || undefined), promptTokens: tokensIn, completionTokens: tokensOut }, ...(evaluatorUsage ? [evaluatorUsage] : [])];
          const totalTokensIn = allUsage.reduce((sum, u) => sum + u.promptTokens, 0);
          const totalTokensOut = allUsage.reduce((sum, u) => sum + u.completionTokens, 0);
          const cost = Number(sumCostUsd(allUsage).toFixed(5));
          // RESOLVE's seed plan plus any tool the model called during COMPOSE.
          const toolsUsed = [...new Set([...toolPlan.map((t) => t.tool), ...toolEvidence.usedTools])];
          const providersFailed = [...new Set([...evidenceUnavailableProviders, ...toolEvidence.unavailableProviders])];
          logger.info(
            {
              ai: {
                intent: resolved.intent,
                toolPlan: toolsUsed,
                providersFailed,
                blocks: meta.blocks.map((b) => b.type),
                tokensIn: totalTokensIn,
                tokensOut: totalTokensOut,
                costUsd: cost,
                latencyMs: { resolve: result.timings.resolveMs, retrieve: result.timings.retrieveMs, compose: composeMs, total: totalMs },
              },
            },
            "ai turn",
          );
          // Best-effort (already swallows its own errors) and genuinely not needed before
          // responding — the final SSE frame carrying meta.blocks (place cards, itinerary/weather/
          // budget blocks, clarify chips) waits on this callback's promise, so awaiting a trace
          // write and a summary refresh + LLM call here delayed those cards behind work the user
          // isn't waiting on. Fire-and-forget, NOT `after()` — confirmed live (2026-09-16) that
          // `after()`'s queued callback never actually runs for this route: its own internal
          // `runCallbacksOnClose` waits for the platform's "response closed" signal, which never
          // fires for this route's custom streaming `ReadableStream` Response (verified by
          // comparing against `group-chat/roam/route.ts`'s buffered `NextResponse.json` response,
          // whose identical `after(() => recordAiTurn(...))` call DOES write a row). A bare call
          // risks losing the write if the platform tears the process down instantly after the
          // response finishes — the exact race `after()` was meant to avoid — but that's strictly
          // better than the current 100%-guaranteed silent no-op.
          void recordAiTurn(threadWriter() ?? supabase, tripId, {
            intent: resolved.intent,
            tools: toolsUsed,
            providers_failed: providersFailed,
            blocks: meta.blocks.map((b) => b.type),
            tokens_in: totalTokensIn,
            tokens_out: totalTokensOut,
            cost_usd: cost,
            resolve_ms: result!.timings.resolveMs,
            retrieve_ms: result!.timings.retrieveMs,
            compose_ms: composeMs,
            total_ms: totalMs,
            model_resolve: resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined),
            model_compose: composedModel,
            degraded: Boolean(resolved.degraded),
          });
          void refreshThreadSummary(supabase, tripId, userId);
        },
      ),
      { headers: SSE_HEADERS },
    );
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 503;
    return NextResponse.json(
      // Reaching this catch means the user's message was already persisted above — only the
      // reply generation failed. `userSaved` lets the client keep the message on screen and
      // offer a retry instead of saying it never sent.
      { error: status === 429 ? "Roam is busy right now. Try again in a moment." : "Roam is unavailable right now.", userSaved: true },
      { status, headers: status === 429 ? { "retry-after": "10" } : undefined },
    );
  }
});
