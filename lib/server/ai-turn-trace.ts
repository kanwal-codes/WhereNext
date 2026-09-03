import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/server/logger";

/** One row of `ai_turn_traces` — the queryable twin of the `"ai turn"` log line. */
export type AiTurnTrace = {
  intent: string;
  tools: string[];
  providers_failed: string[];
  blocks: string[];
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  resolve_ms?: number;
  retrieve_ms?: number;
  compose_ms?: number;
  total_ms?: number;
  model_resolve?: string;
  model_compose?: string;
  /** Turn planning fell back to its safe default (router call failed). */
  degraded?: boolean;
};

/**
 * Fire-and-forget insert of one turn trace. A trace write must never affect the
 * response, so every failure path — a rejected insert, a missing table, an
 * unexpected client shape — is logged at debug and swallowed.
 */
export function recordAiTurn(supabase: SupabaseClient, tripId: string, trace: AiTurnTrace): void {
  try {
    void supabase
      .from("ai_turn_traces")
      .insert({ trip_id: tripId, ...trace })
      .then(
        ({ error }) => {
          if (error) logger.debug({ err: error }, "ai turn trace insert failed");
        },
        () => undefined,
      );
  } catch (error) {
    logger.debug({ err: error }, "ai turn trace insert failed");
  }
}
