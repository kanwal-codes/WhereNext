import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "@/packages/ai/model-policy";

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
 *
 * Deliberately does NOT ask the model to restate destination/dates/travelers/budget/
 * likes/dislikes — `formatTripMemory` already supplies all of those fresh from the trip's own
 * row every single turn. A real bug, found live: the old prompt DID ask for them, so once the
 * summary "locked in" a fact (e.g. trip dates from an earlier conversation), it kept getting
 * merged forward turn after turn with no way to notice the real `trips` row had since changed
 * through some other path — RESOLVE/COMPOSE ended up seeing the fresh, correct dates from
 * `formatTripMemory` and the stale, contradictory ones from this summary in the SAME prompt.
 * Scoping this to only conversational context with no other structural home removes the
 * redundancy that let it drift stale in the first place.
 */
export async function refreshThreadSummary(
  supabase: SupabaseClient,
  tripId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<void> {
  // Every caller invokes this via `after(() => refreshThreadSummary(...))`, fire-and-forget —
  // the whole body (not just the model call below) is wrapped so an unexpected throw (a Supabase
  // client-level exception, not just an `{error}` response) can't surface as an unhandled
  // rejection inside `after()`. Matches this function's own doc comment: a stale or missing
  // summary is always an acceptable outcome, never worth failing anything over.
  try {
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
    const summary = await generateText(
      "bulk",
      [
        { role: "system", content: "Maintain a rolling trip-planning memory in 600 characters or fewer. Never restate the trip's destination, dates, traveler count, budget, or stated likes/dislikes — those are always supplied fresh from the trip's own profile separately, and repeating them here risks the memory going stale and contradicting it later. Instead capture only what has no other structural home: decisions, corrections, or narrowed-down preferences discussed in conversation (a neighborhood or vibe settled on, options ruled out), and the current conversational focus. Merge the previous memory with the new completed messages, dropping anything the new messages make redundant or outdated. Plain text, no preamble, no list markers." },
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
