import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantTurnMeta } from "@/packages/contracts/assistant";
import { estimateTokens, sumCostUsd, type UsageEntry } from "@/lib/ai/pricing";
import { logger } from "@/lib/server/logger";
import { recordAiTurn } from "@/lib/server/ai-turn-trace";
import { refreshThreadSummary } from "@/lib/application/thread-summary";
import type { AssistantTurnResult } from "@/lib/application/orchestrate/run-turn";

type Ready = Extract<AssistantTurnResult, { kind: "ready" }>;
type Early = Exclude<AssistantTurnResult, { kind: "ready" }>;

/** Who is being billed and where the trace goes: `traceClient` is the service-role writer when there is one (ai_turn_traces is server-write-only). */
type Scope = { supabase: SupabaseClient; traceClient: SupabaseClient; tripId: string; userId: string };

/*
 * Both writes below are fire-and-forget, NOT `after()` — confirmed live (2026-09-16) that `after()`'s
 * queued callback never actually runs for the streaming AI route: its own internal `runCallbacksOnClose`
 * waits for the platform's "response closed" signal, which never fires for a custom streaming
 * `ReadableStream` Response (verified by comparing against `group-chat/roam/route.ts`'s buffered
 * `NextResponse.json` response, whose identical `after(() => recordAiTurn(...))` call DOES write a row).
 * Both callees swallow their own errors (best-effort, never throw). A bare call risks losing the write if
 * the platform tears the process down instantly after the response finishes — the exact race `after()`
 * was meant to avoid — but that is strictly better than a guaranteed silent no-op. They are also not
 * needed before responding: the final SSE frame carrying the cards waits on the caller's promise, so
 * awaiting a trace write and a summary refresh there would delay the cards behind work nobody waits for.
 */

/** Records a turn that never reached COMPOSE (declined, clarify, ungrounded): RESOLVE's own usage, the tools it tried. */
export function recordEarlyExitTurn(scope: Scope, input: { result: Early; prompt: string; finalText: string; blocks: AssistantTurnMeta["blocks"]; tools: string[]; providersFailed: string[]; totalMs: number }) {
  const { result, prompt, finalText, blocks, tools, providersFailed, totalMs } = input;
  // RESOLVE's own usage is already in result.usage; fall back to the old char/4 estimate only if RESOLVE itself
  // never reported usage (e.g. both attempts failed and this is the degraded default).
  const usage: UsageEntry[] = result.usage.length
    ? result.usage
    // RESOLVE's own env override, if any — never AI_MODEL (that's COMPOSE's), which
    // would mislabel a fully-degraded RESOLVE with a model it never even attempted.
    : [{ model: result.resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined), promptTokens: estimateTokens(prompt), completionTokens: estimateTokens(finalText) }];
  const tokensIn = usage.reduce((sum, u) => sum + u.promptTokens, 0);
  const tokensOut = usage.reduce((sum, u) => sum + u.completionTokens, 0);
  const cost = Number(sumCostUsd(usage).toFixed(5));
  void recordAiTurn(scope.traceClient, scope.tripId, {
    intent: result.resolved.intent,
    tools,
    providers_failed: providersFailed,
    blocks: blocks.map((block) => block.type),
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: cost,
    resolve_ms: result.timings.resolveMs,
    retrieve_ms: result.timings.retrieveMs,
    total_ms: totalMs,
    model_resolve: result.resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined),
    degraded: Boolean(result.resolved.degraded),
  });
  void refreshThreadSummary(scope.supabase, scope.tripId, scope.userId);
}

/** Records a turn that was composed: prices the WHOLE turn (RESOLVE, every block-builder, COMPOSE and the grounding check), logs it and writes the trace. */
export function recordComposedTurn(scope: Scope, input: { result: Ready; meta: AssistantTurnMeta; finalText: string; tokensIn: number; tokensOut: number; composedModel: string | undefined; composeMs: number | undefined; evaluatorUsage: UsageEntry | undefined; totalMs: number }) {
  const { result, meta, finalText, composedModel, composeMs, evaluatorUsage, totalMs } = input;
  const { toolEvidence, toolPlan, evidenceUnavailableProviders, resolved } = result;
  // A local fake / Cerebras may not report usage — fall back to a char/4 estimate.
  const tokensIn = input.tokensIn || estimateTokens(result.system);
  const tokensOut = input.tokensOut || estimateTokens(finalText);
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
  void recordAiTurn(scope.traceClient, scope.tripId, {
    intent: resolved.intent,
    tools: toolsUsed,
    providers_failed: providersFailed,
    blocks: meta.blocks.map((b) => b.type),
    tokens_in: totalTokensIn,
    tokens_out: totalTokensOut,
    cost_usd: cost,
    resolve_ms: result.timings.resolveMs,
    retrieve_ms: result.timings.retrieveMs,
    compose_ms: composeMs,
    total_ms: totalMs,
    model_resolve: resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined),
    model_compose: composedModel,
    degraded: Boolean(resolved.degraded),
  });
  void refreshThreadSummary(scope.supabase, scope.tripId, scope.userId);
}
