import { NextResponse } from "next/server";
import { streamText, stepCountIs } from "ai";
import { createReasoningGate } from "@/lib/ai/strip-reasoning";
import { aiRequestSchema, compactAiMessages } from "@/packages/contracts/ai-request";
import type { AssistantBlock, AssistantTurnMeta } from "@/packages/contracts/assistant";
import { composeModelChain } from "@/packages/ai/compose-model";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail, withRoute } from "@/lib/server/with-route";
import { logger } from "@/lib/server/logger";
import { costUsd, estimateTokens } from "@/lib/ai/pricing";
import { loadTripContext, formatTripMemory } from "@/lib/application/trip-context";
import { runAssistantTurn, finalizeAssistantBlocks } from "@/lib/application/assistant-turn";
import { refreshThreadSummary } from "@/lib/application/thread-summary";
import { persistedAssistantStream } from "@/features/conversation/application/persistedAssistantStream";
import { createConversationRepository } from "@/features/conversation/infrastructure/conversationRepository";
import { sanitizeAssistantContent } from "@/lib/application/sanitize-assistant";
import { withTripAiStream } from "@/lib/server/trip-ai-queue";
import { recordAiTurn } from "@/lib/server/ai-turn-trace";

const SSE_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" };

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

export const POST = withRoute(async function POST(request: Request) {
  const parsed = aiRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid AI request" }, { status: 400 });
  const { tripId } = parsed.data;

  let supabase: SupabaseClient;
  let userId: string;
  try {
    ({ supabase, user: { id: userId } } = await requireTripMember(tripId));
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Assistant unavailable");
  }

  try {
    // Context, thread summary and the stored transcript are independent — one round-trip.
    const [tripCtx, threadRow, storedMessages] = await Promise.all([
      loadTripContext(supabase, tripId),
      supabase.from("conversation_threads").select("summary").eq("trip_id", tripId).eq("user_id", userId).maybeSingle(),
      // The UI can page the full durable thread; model context stays bounded and is supplemented
      // by the thread summary so a long-running trip does not balloon every AI request.
      createConversationRepository(supabase).list(tripId, userId, { limit: 200 }),
    ]);
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

    // Per-turn trace timing + token accounting (COMPOSE usage arrives late, via the stream sniffer).
    const t0 = performance.now();
    let tokensIn = 0;
    let tokensOut = 0;
    // Which model in the COMPOSE fallback chain actually produced the streamed prose —
    // undefined when a structured block's own intro answered the turn (COMPOSE never ran).
    let composedModel: string | undefined;

    const result = await runAssistantTurn(
      { supabase, tripId },
      {
        tripCtx, prompt, history: modelMessages, tripSummary, viewContext, surfacedEarlier, signal: request.signal,
        deriveTripSummary: (ctx) => [formatTripMemory(ctx), threadSummary && `Earlier context (current trip facts take precedence): ${threadSummary}`].filter(Boolean).join(" "),
      },
    );

    const respondWithoutCompose = (
      content: string,
      meta: AssistantTurnMeta,
      tools: string[] = [],
      providersFailed: string[] = [],
    ) => new Response(
      persistedAssistantStream(cannedStream(content), supabase, tripId, userId, idempotencyKey, undefined, meta, async (finalText) => {
        const totalMs = Math.round(performance.now() - t0);
        tokensIn = estimateTokens(prompt);
        tokensOut = estimateTokens(finalText);
        const cost = Number(costUsd(process.env.AI_MODEL, tokensIn, tokensOut).toFixed(5));
        await recordAiTurn(supabase, tripId, {
          intent: result.resolved.intent,
          tools,
          providers_failed: providersFailed,
          blocks: meta.blocks.map((block) => block.type),
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: cost,
          resolve_ms: result.timings.resolveMs,
          retrieve_ms: result.timings.retrieveMs,
          total_ms: totalMs,
          model_resolve: result.resolved.modelUsed ?? (process.env.RESOLVE_MODEL || process.env.AI_MODEL || undefined),
          degraded: Boolean(result.resolved.degraded),
        });
        await refreshThreadSummary(supabase, tripId, userId);
      }),
      { headers: SSE_HEADERS },
    );

    // --- OUT OF SCOPE / CLARIFY / UNGROUNDED ---------------------------------
    // No connection to travel or this trip, a genuine ambiguity, or nothing came back from
    // RETRIEVE for a plan that needed grounding — decline/ask/apologise in one line and stop.
    if (result.kind === "declined" || result.kind === "clarify") {
      return respondWithoutCompose(result.content, result.meta);
    }
    if (result.kind === "ungrounded") {
      return respondWithoutCompose(result.content, result.meta, result.toolsUsed, result.providersFailed);
    }

    // --- COMPOSE (bounded tool-calling loop) --------------------------------
    const { system, composeSkipLine, composeTools, toolEvidence, allowedUrls, toolPlan, evidenceUnavailableProviders, cardPlaceProviderIds, sideBuilders, resolved } = result;
    const tCompose = performance.now();
    const composeChain = composeModelChain();
    const stream = composeSkipLine ? cannedStream(composeSkipLine) : await withTripAiStream(tripId, async () => {
      // Try the primary model, then each fallback, until one produces its first chunk. Forcing
      // the first step here also means a provider 4xx/5xx surfaces before the Response, so the
      // route's catch tail can still return a 429/503 rather than an empty stream.
      let iterator: AsyncIterator<string> | undefined;
      let firstChunk: IteratorResult<string> | undefined;
      let lastError: unknown;
      // A stalled provider must not hang the turn: cap time-to-first-token per attempt (move to
      // the next model in the chain), and cap the whole stream well above any real answer length.
      const withTtft = <T,>(promise: Promise<T>): Promise<T> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("compose time-to-first-token exceeded")), AI_DEADLINE_MS.composeTtft);
        });
        return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
      };
      for (let i = 0; i < composeChain.length; i += 1) {
        const entry = composeChain[i];
        const result = streamText({
          model: entry.model,
          system,
          messages: compactAiMessages(modelMessages, 12, 12_000),
          tools: composeTools,
          stopWhen: stepCountIs(4),
          abortSignal: withDeadline(request.signal, 60_000),
          providerOptions: entry.providerOptions,
          onError: ({ error }) => logger.error({ err: error }, "compose stream error"),
        });
        try {
          const it = result.textStream[Symbol.asyncIterator]();
          firstChunk = await withTtft(it.next());
          iterator = it;
          composedModel = entry.modelId;
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

    // Side-builders were kicked off before COMPOSE and have been running concurrently.
    const [checklist, comparison] = await Promise.all([sideBuilders.checklistPromise, sideBuilders.comparisonPromise]);
    const meta = finalizeAssistantBlocks(result.meta, { checklist, comparison }, cardPlaceProviderIds);

    return new Response(
      persistedAssistantStream(stream, supabase, tripId, userId, idempotencyKey, (content) => sanitizeAssistantContent(content, allowedUrls), meta, async (finalText) => {
        const composeMs = Math.round(performance.now() - tCompose);
        const totalMs = Math.round(performance.now() - t0);
        // A local fake / Cerebras may not report usage — fall back to a char/4 estimate.
        if (!tokensIn) tokensIn = estimateTokens(system);
        if (!tokensOut) tokensOut = estimateTokens(finalText);
        const cost = Number(costUsd(process.env.AI_MODEL, tokensIn, tokensOut).toFixed(5));
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
              tokensIn,
              tokensOut,
              costUsd: cost,
              latencyMs: { resolve: result.timings.resolveMs, retrieve: result.timings.retrieveMs, compose: composeMs, total: totalMs },
            },
          },
          "ai turn",
        );
        await recordAiTurn(supabase, tripId, {
          intent: resolved.intent,
          tools: toolsUsed,
          providers_failed: providersFailed,
          blocks: meta.blocks.map((b) => b.type),
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: cost,
          resolve_ms: result.timings.resolveMs,
          retrieve_ms: result.timings.retrieveMs,
          compose_ms: composeMs,
          total_ms: totalMs,
          model_resolve: resolved.modelUsed ?? (process.env.RESOLVE_MODEL || process.env.AI_MODEL || undefined),
          model_compose: composedModel,
          degraded: Boolean(resolved.degraded),
        });
        await refreshThreadSummary(supabase, tripId, userId);
      }),
      { headers: SSE_HEADERS },
    );
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 503;
    return NextResponse.json(
      { error: status === 429 ? "Roam is busy right now. Try again in a moment." : "Roam is unavailable right now." },
      { status, headers: status === 429 ? { "retry-after": "10" } : undefined },
    );
  }
});
