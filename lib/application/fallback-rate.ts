import type { SupabaseClient } from "@supabase/supabase-js";
import { chainEntryId, modelChainFor } from "@/packages/ai/model-policy";

export type FallbackRateResult = { total: number; fallback: number; rate: number; pinnedModel: string };

/**
 * Trailing-window RESOLVE fallback rate (Phase 2.3, docs/overhaul/roadmap/phase-2-speed.md):
 * the fraction of recent RESOLVE calls that landed on anything other than the pinned
 * Cerebras lead model. Only `model_resolve` is recorded per-trace — `bulk`'s actual model
 * isn't tracked in `ai_turn_traces`, so this can't (and doesn't try to) cover `bulk` too.
 */
export async function fallbackRate(supabase: SupabaseClient, windowMinutes: number): Promise<FallbackRateResult> {
  const pinnedModel = chainEntryId(modelChainFor("resolve")[0]);
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from("ai_turn_traces")
    .select("model_resolve")
    .gte("created_at", since)
    .not("model_resolve", "is", null);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ model_resolve: string }>;
  const total = rows.length;
  const fallback = rows.filter((r) => r.model_resolve !== pinnedModel).length;
  return { total, fallback, rate: total ? fallback / total : 0, pinnedModel };
}
