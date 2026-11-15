import { z } from "zod";

export const REPLY_NOTE_MAX = 280;
export type ReplyRating = "up" | "down";

// A just-streamed reply still carries its local id until the thread reloads; the server finds it by the send key inside.
const LOCAL_REPLY_ID = /^local-assistant-[\w-]{1,120}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `rating: null` clears the traveller's rating. The note belongs to a thumbs-down only. */
export const replyFeedbackInput = z.object({
  messageId: z.string().refine((id) => UUID.test(id) || LOCAL_REPLY_ID.test(id), "Invalid reply id"),
  rating: z.enum(["up", "down"]).nullable(),
  note: z.string().trim().max(REPLY_NOTE_MAX).optional(),
});

/** The idempotency key a stored reply carries for a local id (`local-assistant-<key>` -> `assistant:<key>`), or null for a real id. */
export function localReplyKey(messageId: string) {
  return LOCAL_REPLY_ID.test(messageId) ? `assistant:${messageId.slice("local-assistant-".length)}` : null;
}
