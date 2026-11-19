import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/server/logger";

/**
 * Whole-turn recording for replay. On everywhere except production; in production only when ROAM_RECORD_TURNS=1
 * (it stores what people typed, so it is a deliberate switch once there are other users). ROAM_RECORD_TURNS=0 turns it off anywhere.
 */
export function recordingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.ROAM_RECORD_TURNS === "0") return false;
  if (env.ROAM_RECORD_TURNS === "1") return true;
  return env.NODE_ENV !== "production";
}

export type TurnRecord = {
  kind: "ready" | "declined" | "clarify" | "ungrounded";
  prompt: string;
  history: Array<{ role: string; content: string }>;
  tripSummary?: string;
  resolved: unknown;
  toolPlan?: unknown;
  evidence?: unknown;
  systemPrompt?: string;
  reply: string;
  blocks: string[];
};

/** Past this, the provider evidence is left out (the row still replays the router). */
const MAX_EVIDENCE_CHARS = 400_000;

/** Best-effort, like the trace write: it must never affect the answer. */
export async function recordTurnContent(client: SupabaseClient, scope: { tripId: string; userId: string }, record: TurnRecord): Promise<void> {
  if (!recordingEnabled()) return;
  try {
    const evidenceText = record.evidence === undefined ? undefined : JSON.stringify(record.evidence);
    const { error } = await client.from("ai_turn_records").insert({
      trip_id: scope.tripId,
      user_id: scope.userId,
      kind: record.kind,
      prompt: record.prompt,
      history: record.history.slice(-8),
      trip_summary: record.tripSummary ?? null,
      resolved: record.resolved,
      tool_plan: record.toolPlan ?? null,
      evidence: evidenceText && evidenceText.length <= MAX_EVIDENCE_CHARS ? JSON.parse(evidenceText) : null,
      system_prompt: record.systemPrompt ?? null,
      reply: record.reply,
      blocks: record.blocks,
    });
    if (error) logger.debug({ err: error }, "ai turn record insert failed");
  } catch (error) {
    logger.debug({ err: error }, "ai turn record insert failed");
  }
}
