import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageInput } from "../domain/message";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

type ConversationRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  idempotency_key: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export function scopedMessageIdempotencyKey(role: MessageInput["role"], key?: string) {
  return key ? `${role}:${key}` : null;
}

/**
 * `writer` is used only to create the thread row for a brand-new trip. RLS on
 * `conversation_threads` is fine for members, but the caller has already proven
 * membership (`requireTripMember`), so a service-role writer here removes any
 * chance of a first-message failure. Reads/writes of messages stay on the
 * user-scoped client so RLS still applies.
 */
export function createConversationRepository(supabase: SupabaseClient, writer: SupabaseClient = supabase) {
  async function getThreadId(tripId: string, userId: string) {
    const existing = await supabase.from("conversation_threads").select("id").eq("trip_id", tripId).eq("user_id", userId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data.id as string;

    const created = await writer
      .from("conversation_threads")
      .upsert({ trip_id: tripId, user_id: userId }, { onConflict: "trip_id,user_id", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (created.error) throw created.error;
    if (created.data?.id) return created.data.id as string;

    const retry = await supabase.from("conversation_threads").select("id").eq("trip_id", tripId).eq("user_id", userId).single();
    if (retry.error) throw retry.error;
    return retry.data.id as string;
  }
  return {
    async list(tripId: string, userId: string, options: { limit?: number } = {}) {
      const id = await getThreadId(tripId, userId);
      // Supabase limits result sets, so page the complete thread newest-first and only reverse
      // after every page has arrived. This is the durable cross-device source of truth.
      const pageSize = 500;
      const newestFirst: ConversationRow[] = [];
      for (let from = 0; ; from += pageSize) {
        const remaining = options.limit == null ? pageSize : Math.min(pageSize, options.limit - from);
        if (remaining <= 0) break;
        const result = await supabase
          .from("conversation_messages")
          .select("id,role,content,idempotency_key,created_at,metadata")
          .eq("thread_id", id)
          // Postgres doesn't guarantee row order across separate paginated queries when rows
          // share a created_at value — a secondary tiebreaker on the primary key keeps paging
          // stable instead of risking a duplicated or skipped row at a page boundary.
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, from + remaining - 1);
        if (result.error) throw result.error;
        const page = (result.data ?? []) as ConversationRow[];
        newestFirst.push(...page);
        if (page.length < remaining) break;
      }
      return newestFirst.reverse();
    },
    async append(tripId: string, userId: string, input: MessageInput & { metadata?: Record<string, unknown> }) {
      const id = await getThreadId(tripId, userId);
      const idempotencyKey = scopedMessageIdempotencyKey(input.role, input.idempotencyKey);
      const row = { thread_id: id, role: input.role, content: input.content, idempotency_key: idempotencyKey, metadata: input.metadata ?? {} };
      const result = idempotencyKey
        ? await supabase.from("conversation_messages").upsert(row, { onConflict: "thread_id,idempotency_key" }).select("id,role,content,created_at,metadata").single()
        : await supabase.from("conversation_messages").insert(row).select("id,role,content,created_at,metadata").single();
      if (result.error) throw result.error;
      invalidateWorkspace(tripId);
      return result.data;
    },
  };
}
