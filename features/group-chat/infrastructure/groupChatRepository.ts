import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupMessage, GroupMessageReaction, GroupMessageKind } from "../domain/message";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { resolvePolls } from "@/lib/server/poll";

type GroupMessageRow = {
  id: string;
  user_id: string | null;
  role: "user" | "assistant" | "system";
  kind: GroupMessageKind;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const toMessage = (row: GroupMessageRow, reactions: GroupMessageReaction[]): GroupMessage => ({
  id: row.id,
  userId: row.user_id,
  role: row.role,
  kind: row.kind,
  content: row.content,
  metadata: row.metadata ?? {},
  created_at: row.created_at,
  reactions,
});

/** Embeds each poll-kind message's LIVE tally into its metadata — a poll's card must show
 *  current results every time messages are (re)fetched, not just what was true at creation. */
async function withResolvedPolls(supabase: SupabaseClient, messages: GroupMessage[], viewerId: string): Promise<GroupMessage[]> {
  const pollIds = messages.filter((m) => m.kind === "poll").map((m) => (m.metadata as { pollId?: string }).pollId).filter((id): id is string => Boolean(id));
  if (pollIds.length === 0) return messages;
  const resolved = await resolvePolls(supabase, pollIds, viewerId);
  return messages.map((m) => {
    const pollId = (m.metadata as { pollId?: string }).pollId;
    const poll = pollId ? resolved.get(pollId) : undefined;
    return poll ? { ...m, metadata: { ...m.metadata, poll } } : m;
  });
}

async function reactionsByMessage(supabase: SupabaseClient, messageIds: string[], viewerId: string): Promise<Map<string, GroupMessageReaction[]>> {
  const map = new Map<string, GroupMessageReaction[]>();
  if (messageIds.length === 0) return map;
  const result = await supabase.from("group_message_reactions").select("message_id,user_id,emoji").in("message_id", messageIds);
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as Array<{ message_id: string; user_id: string; emoji: string }>;
  const byMessageAndEmoji = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const row of rows) {
    const byEmoji = byMessageAndEmoji.get(row.message_id) ?? new Map();
    const current = byEmoji.get(row.emoji) ?? { count: 0, mine: false };
    current.count += 1;
    if (row.user_id === viewerId) current.mine = true;
    byEmoji.set(row.emoji, current);
    byMessageAndEmoji.set(row.message_id, byEmoji);
  }
  for (const [messageId, byEmoji] of byMessageAndEmoji) {
    map.set(messageId, [...byEmoji.entries()].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })));
  }
  return map;
}

const COLUMNS = "id,user_id,role,kind,content,metadata,created_at";

/** Same scoping `append` stores under — a lookup key must match it exactly to find the row. */
const scopedIdempotencyKey = (role: string, key: string) => `${role}:${key}`;

/**
 * `trip_id` is the message's whole identity — unlike personal threads, group chat has no
 * per-thread indirection to resolve first.
 */
export function createGroupChatRepository(supabase: SupabaseClient) {
  return {
    async list(tripId: string, viewerId: string, options: { limit?: number; /** Only messages sent before this ISO time: the page of history older than what is already on screen. */ before?: string } = {}): Promise<GroupMessage[]> {
      // Same newest-first-then-reverse paging as conversationRepository — Supabase caps a
      // single page, so page backwards and only flip once every page has arrived.
      const pageSize = 500;
      const newestFirst: GroupMessageRow[] = [];
      for (let from = 0; ; from += pageSize) {
        const remaining = options.limit == null ? pageSize : Math.min(pageSize, options.limit - from);
        if (remaining <= 0) break;
        let query = supabase
          .from("group_messages")
          .select(COLUMNS)
          .eq("trip_id", tripId);
        if (options.before) query = query.lt("created_at", options.before);
        const result = await query
          // Secondary tiebreaker on id — several members can write within the same created_at
          // granularity, and Postgres doesn't guarantee stable ordering across separate
          // paginated queries without one, risking a duplicated or skipped row at a page edge.
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, from + remaining - 1);
        if (result.error) throw result.error;
        const page = (result.data ?? []) as GroupMessageRow[];
        newestFirst.push(...page);
        if (page.length < remaining) break;
      }
      const oldestFirst = newestFirst.reverse();
      const reactions = await reactionsByMessage(supabase, oldestFirst.map((row) => row.id), viewerId);
      const messages = oldestFirst.map((row) => toMessage(row, reactions.get(row.id) ?? []));
      return withResolvedPolls(supabase, messages, viewerId);
    },
    async append(
      tripId: string,
      input: {
        userId: string | null;
        role: "user" | "assistant" | "system";
        kind: GroupMessageKind;
        content: string;
        metadata?: Record<string, unknown>;
        idempotencyKey?: string;
      },
    ): Promise<GroupMessage> {
      // Prefixed by the write's own server-determined role — same fix as
      // conversationRepository's scopedMessageIdempotencyKey. Without this, a client-supplied
      // key lives in the same (trip_id, idempotency_key) namespace as Roam's own reserved
      // `roam-reply:...` keys (written via the service-role client), so a member could
      // pre-plant a row under a guessed future Roam-reply key and have Roam's real reply
      // silently upsert onto (overwrite) it later.
      const idempotencyKey = input.idempotencyKey ? scopedIdempotencyKey(input.role, input.idempotencyKey) : null;
      const row = {
        trip_id: tripId,
        user_id: input.userId,
        role: input.role,
        kind: input.kind,
        content: input.content,
        metadata: input.metadata ?? {},
        idempotency_key: idempotencyKey,
      };
      const result = idempotencyKey
        ? await supabase.from("group_messages").upsert(row, { onConflict: "trip_id,idempotency_key" }).select(COLUMNS).single()
        : await supabase.from("group_messages").insert(row).select(COLUMNS).single();
      if (result.error) throw result.error;
      invalidateWorkspace(tripId);
      return toMessage(result.data as GroupMessageRow, []);
    },
    /** Look up one message by id regardless of the recent-history window `list()` is bounded to
     *  — "Ask Roam about this" targets a specific message id, and a busy trip can easily push
     *  that message past `list()`'s limit before the action is used. */
    async getById(tripId: string, messageId: string, viewerId: string): Promise<GroupMessage | null> {
      const result = await supabase.from("group_messages").select(COLUMNS).eq("trip_id", tripId).eq("id", messageId).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return null;
      const reactions = await reactionsByMessage(supabase, [messageId], viewerId);
      const [message] = await withResolvedPolls(supabase, [toMessage(result.data as GroupMessageRow, reactions.get(messageId) ?? [])], viewerId);
      return message;
    },
    /** Look up an already-written row by its pre-scoping key, so a caller about to do
     *  expensive work (an LLM turn) to build the content for that same key can check first
     *  and skip recomputing it — `append`'s own upsert only dedupes the *write*, not whatever
     *  work happened before it. */
    async getByIdempotencyKey(tripId: string, role: "user" | "assistant" | "system", idempotencyKey: string): Promise<GroupMessage | null> {
      const result = await supabase
        .from("group_messages")
        .select(COLUMNS)
        .eq("trip_id", tripId)
        .eq("idempotency_key", scopedIdempotencyKey(role, idempotencyKey))
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data ? toMessage(result.data as GroupMessageRow, []) : null;
    },
  };
}
