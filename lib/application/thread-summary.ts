import type { SupabaseClient } from "@supabase/supabase-js";
import { gatewayFor } from "@/packages/ai/model-policy";

const SUMMARY_THRESHOLD = 16;
const SUMMARY_EVERY = 4; // refresh once every N messages past the threshold, not every turn

/**
 * Best-effort rolling summary. Once a thread is long, keep a <=600-char digest on
 * `conversation_threads.summary` so RESOLVE and COMPOSE don't lose the traveller's
 * early context ("5 friends", "no museums") when the message window rolls past it.
 * Fire-and-forget from the route; a stale or missing summary is acceptable.
 */
export async function refreshThreadSummary(
  supabase: SupabaseClient,
  tripId: string,
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<void> {
  if (messages.length <= SUMMARY_THRESHOLD || messages.length % SUMMARY_EVERY !== 0) return;
  const transcript = messages.slice(-40).map((message) => `${message.role}: ${message.content}`).join("\n").slice(0, 8_000);
  try {
    const summary = await gatewayFor("bulk").generateText(
      [
        { role: "system", content: "Summarize this trip-planning conversation in 600 characters or fewer: the traveller's confirmed decisions, stated likes and dislikes, budget, group size, and the place or topic they are focused on now. Plain text, no preamble, no list markers." },
        { role: "user", content: transcript },
      ],
      signal,
    );
    await supabase.from("conversation_threads").update({ summary: summary.trim().slice(0, 600) }).eq("trip_id", tripId);
  } catch {
    // Non-fatal: the next long turn retries.
  }
}
