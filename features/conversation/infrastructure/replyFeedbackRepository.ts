import type { SupabaseClient } from "@supabase/supabase-js";
import { localReplyKey, type ReplyRating } from "../domain/replyFeedback";

/** The traveller's own ratings on Roam's replies. Runs on the user-scoped client: row-level security keeps writes to the author. */
export function createReplyFeedbackRepository(supabase: SupabaseClient) {
  return {
    /** message id -> rating, for this traveller on this trip. */
    async ratingsFor(tripId: string, userId: string) {
      const result = await supabase.from("roam_reply_feedback").select("message_id,rating").eq("trip_id", tripId).eq("user_id", userId);
      if (result.error) throw result.error;
      return new Map((result.data ?? []).map((row) => [row.message_id as string, row.rating as ReplyRating]));
    },
    /** The stored id of a Roam reply in this trip (own thread only, by row-level security), or null. */
    async findReply(tripId: string, messageId: string) {
      const key = localReplyKey(messageId);
      const base = supabase.from("conversation_messages").select("id").eq("trip_id", tripId).eq("role", "assistant");
      const result = await (key ? base.eq("idempotency_key", key) : base.eq("id", messageId)).maybeSingle();
      if (result.error) throw result.error;
      return (result.data?.id as string | undefined) ?? null;
    },
    async rate(tripId: string, userId: string, messageId: string, rating: ReplyRating, note: string | null) {
      const result = await supabase
        .from("roam_reply_feedback")
        .upsert({ message_id: messageId, user_id: userId, trip_id: tripId, rating, note, updated_at: new Date().toISOString() }, { onConflict: "message_id,user_id" });
      if (result.error) throw result.error;
    },
    async clear(userId: string, messageId: string) {
      const result = await supabase.from("roam_reply_feedback").delete().eq("message_id", messageId).eq("user_id", userId);
      if (result.error) throw result.error;
    },
  };
}
