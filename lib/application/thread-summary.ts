import type { SupabaseClient } from "@supabase/supabase-js";
import { gatewayFor } from "@/packages/ai/model-policy";

const SUMMARY_THRESHOLD = 16;
const SUMMARY_BATCH_SIZE = 8;
const SUMMARY_WINDOW = 48;

type ThreadSummaryRow = {
  id: string;
  summary: string | null;
  summarized_through_message_id: string | null;
  summarized_through_created_at: string | null;
};

type SummaryMessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

/**
 * Best-effort rolling summary. Once a thread is long, keep a <=600-char digest on
 * `conversation_threads.summary` so RESOLVE and COMPOSE don't lose the traveller's
 * early context ("5 friends", "no museums") when the message window rolls past it.
 * Fire-and-forget from the route; a stale or missing summary is acceptable.
 */
export async function refreshThreadSummary(
  supabase: SupabaseClient,
  tripId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<void> {
  const thread = await supabase
    .from("conversation_threads")
    .select("id,summary,summarized_through_message_id,summarized_through_created_at")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();
  if (thread.error || !thread.data) return;

  const row = thread.data as ThreadSummaryRow;
  let query = supabase
    .from("conversation_messages")
    .select("id,role,content,created_at")
    .eq("thread_id", row.id)
    .order("created_at", { ascending: true });
  if (row.summarized_through_created_at) query = query.gt("created_at", row.summarized_through_created_at);

  const result = await query.limit(SUMMARY_WINDOW);
  if (result.error) return;
  const newMessages = ((result.data ?? []) as SummaryMessageRow[])
    .filter((message) => message.role === "user" || message.role === "assistant");
  if (newMessages.length === 0) return;
  if (!row.summary && newMessages.length <= SUMMARY_THRESHOLD) return;
  if (row.summary && newMessages.length < SUMMARY_BATCH_SIZE) return;

  const lastMessage = newMessages.at(-1);
  if (!lastMessage) return;
  const previous = row.summary?.trim();
  const transcript = newMessages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n")
    .slice(0, 8_000);
  try {
    const summary = await gatewayFor("bulk").generateText(
      [
        { role: "system", content: "Maintain a rolling trip-planning memory in 600 characters or fewer. Preserve confirmed decisions, corrections, stated likes/dislikes, budget, group size, dates, destination, and the current focus. Merge the previous memory with the new completed messages. Plain text, no preamble, no list markers." },
        { role: "user", content: [previous ? `Previous memory:\n${previous}` : "", `New messages:\n${transcript}`].filter(Boolean).join("\n\n") },
      ],
      signal,
    );
    await supabase
      .from("conversation_threads")
      .update({
        summary: summary.trim().slice(0, 600),
        summarized_through_message_id: lastMessage.id,
        summarized_through_created_at: lastMessage.created_at,
      })
      .eq("id", row.id);
  } catch {
    // Non-fatal: the next long turn retries.
  }
}
