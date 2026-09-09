import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupMessage, GroupMessageReaction } from "../domain/message";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

type GroupMessageRow = {
  id: string;
  user_id: string | null;
  role: "user" | "assistant" | "system";
  kind: "text" | "content_share" | "expense" | "system";
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

/**
 * `trip_id` is the message's whole identity — unlike personal threads, group chat has no
 * per-thread indirection to resolve first.
 */
export function createGroupChatRepository(supabase: SupabaseClient) {
  return {
    async list(tripId: string, viewerId: string, options: { limit?: number } = {}): Promise<GroupMessage[]> {
      // Same newest-first-then-reverse paging as conversationRepository — Supabase caps a
      // single page, so page backwards and only flip once every page has arrived.
      const pageSize = 500;
      const newestFirst: GroupMessageRow[] = [];
      for (let from = 0; ; from += pageSize) {
        const remaining = options.limit == null ? pageSize : Math.min(pageSize, options.limit - from);
        if (remaining <= 0) break;
        const result = await supabase
          .from("group_messages")
          .select(COLUMNS)
          .eq("trip_id", tripId)
          .order("created_at", { ascending: false })
          .range(from, from + remaining - 1);
        if (result.error) throw result.error;
        const page = (result.data ?? []) as GroupMessageRow[];
        newestFirst.push(...page);
        if (page.length < remaining) break;
      }
      const oldestFirst = newestFirst.reverse();
      const reactions = await reactionsByMessage(supabase, oldestFirst.map((row) => row.id), viewerId);
      return oldestFirst.map((row) => toMessage(row, reactions.get(row.id) ?? []));
    },
    async append(
      tripId: string,
      input: {
        userId: string | null;
        role: "user" | "assistant" | "system";
        kind: "text" | "content_share" | "expense" | "system";
        content: string;
        metadata?: Record<string, unknown>;
        idempotencyKey?: string;
      },
    ): Promise<GroupMessage> {
      const row = {
        trip_id: tripId,
        user_id: input.userId,
        role: input.role,
        kind: input.kind,
        content: input.content,
        metadata: input.metadata ?? {},
        idempotency_key: input.idempotencyKey ?? null,
      };
      const result = input.idempotencyKey
        ? await supabase.from("group_messages").upsert(row, { onConflict: "trip_id,idempotency_key" }).select(COLUMNS).single()
        : await supabase.from("group_messages").insert(row).select(COLUMNS).single();
      if (result.error) throw result.error;
      invalidateWorkspace(tripId);
      return toMessage(result.data as GroupMessageRow, []);
    },
  };
}
