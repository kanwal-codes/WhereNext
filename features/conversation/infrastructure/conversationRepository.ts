import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageInput } from "../domain/message";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

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
  async function getThreadId(tripId: string) {
    const existing = await supabase.from("conversation_threads").select("id").eq("trip_id", tripId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data.id as string;

    const created = await writer
      .from("conversation_threads")
      .upsert({ trip_id: tripId }, { onConflict: "trip_id", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (created.error) throw created.error;
    if (created.data?.id) return created.data.id as string;

    const retry = await supabase.from("conversation_threads").select("id").eq("trip_id", tripId).single();
    if (retry.error) throw retry.error;
    return retry.data.id as string;
  }
  return {
    async list(tripId: string) {
      const id = await getThreadId(tripId);
      // Newest 200, returned oldest-first. Ordering ascending with a limit would silently drop
      // the LATEST messages once a thread passes 200 — which broke the "user message persisted?"
      // check in /api/ai (every new turn 409'd) on long-running conversations.
      const result = await supabase
        .from("conversation_messages")
        .select("id,role,content,idempotency_key,created_at,metadata")
        .eq("thread_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (result.error) throw result.error;
      return (result.data ?? []).reverse();
    },
    async append(tripId: string, input: MessageInput & { metadata?: Record<string, unknown> }) {
      const id = await getThreadId(tripId);
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
