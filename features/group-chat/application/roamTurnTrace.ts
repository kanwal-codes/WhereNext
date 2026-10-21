import { estimateTokens, sumCostUsd, type UsageEntry } from "@/lib/ai/pricing";
import type { AssistantTurnResult } from "@/lib/application/orchestrate/run-turn";
import type { AssistantTurnMeta } from "@/packages/contracts/assistant";

type Ready = Extract<AssistantTurnResult, { kind: "ready" }>;
type Early = Exclude<AssistantTurnResult, { kind: "ready" }>;

/** The `ai_turn_traces` row for a @Roam reply that never reached COMPOSE (declined, clarify, ungrounded). */
export function earlyExitTrace(result: Early, prompt: string, totalMs: number) {
  const usage: UsageEntry[] = result.usage.length
    ? result.usage
    : [{ model: result.resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined), promptTokens: estimateTokens(prompt), completionTokens: estimateTokens(result.content) }];
  return {
    intent: result.resolved.intent,
    tools: result.kind === "ungrounded" ? result.toolsUsed : [],
    providers_failed: result.kind === "ungrounded" ? result.providersFailed : [],
    blocks: result.meta.blocks.map((block) => block.type),
    tokens_in: usage.reduce((sum, u) => sum + u.promptTokens, 0),
    tokens_out: usage.reduce((sum, u) => sum + u.completionTokens, 0),
    cost_usd: Number(sumCostUsd(usage).toFixed(5)),
    resolve_ms: result.timings.resolveMs,
    retrieve_ms: result.timings.retrieveMs,
    compose_ms: 0,
    total_ms: totalMs,
    model_resolve: result.resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined),
    degraded: Boolean(result.resolved.degraded),
  };
}

/**
 * The row for a composed @Roam reply. Prices every stage (RESOLVE + bulk block-builders, tracked in result.usage) by the model
 * that actually answered it, plus COMPOSE's own real usage when the provider reported one — falling back to a char/4 estimate
 * priced off the model that actually composed (not the blindly-configured AI_MODEL) only when it didn't.
 */
export function composedTrace(result: Ready, input: { meta: AssistantTurnMeta; sanitized: string; composedModel: string | undefined; composeUsage: { inputTokens?: number; outputTokens?: number } | undefined; evaluatorUsage: UsageEntry | undefined; composeMs: number; totalMs: number }) {
  const { meta, sanitized, composedModel, composeUsage, evaluatorUsage, composeMs, totalMs } = input;
  const { toolEvidence, toolPlan, evidenceUnavailableProviders, resolved } = result;
  const composeEntry: UsageEntry = composeUsage
    ? { model: composedModel, promptTokens: composeUsage.inputTokens ?? 0, completionTokens: composeUsage.outputTokens ?? 0 }
    : { model: composedModel ?? (process.env.AI_MODEL || undefined), promptTokens: estimateTokens(result.system), completionTokens: estimateTokens(sanitized) };
  const allUsage: UsageEntry[] = [...result.usage, composeEntry, ...(evaluatorUsage ? [evaluatorUsage] : [])];
  return {
    intent: resolved.intent,
    tools: [...new Set([...toolPlan.map((call) => call.tool), ...toolEvidence.usedTools])],
    providers_failed: [...new Set([...evidenceUnavailableProviders, ...toolEvidence.unavailableProviders])],
    blocks: meta.blocks.map((block) => block.type),
    tokens_in: allUsage.reduce((sum, u) => sum + u.promptTokens, 0),
    tokens_out: allUsage.reduce((sum, u) => sum + u.completionTokens, 0),
    cost_usd: Number(sumCostUsd(allUsage).toFixed(5)),
    resolve_ms: result.timings.resolveMs,
    retrieve_ms: result.timings.retrieveMs,
    compose_ms: composeMs,
    total_ms: totalMs,
    model_resolve: resolved.modelUsed ?? (process.env.RESOLVE_MODEL || undefined),
    model_compose: composedModel,
    degraded: Boolean(resolved.degraded),
  };
}
