import { z } from "zod";
import { boundedRecord } from "@/packages/contracts/shared";

export const groupMessageInput = z.object({
  content: z.string().trim().min(1).max(4000),
  kind: z.enum(["text", "content_share"]).default("text"),
  shareCard: boundedRecord().optional(),
  idempotencyKey: z.string().min(1).max(120).optional(),
});
export type GroupMessageInput = z.infer<typeof groupMessageInput>;

export type GroupMessageRole = "user" | "assistant" | "system";
export type GroupMessageKind = "text" | "content_share" | "expense" | "system" | "poll";

export type GroupMessageReaction = { emoji: string; count: number; mine: boolean };

export type GroupMessage = {
  id: string;
  userId: string | null;
  role: GroupMessageRole;
  kind: GroupMessageKind;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  reactions: GroupMessageReaction[];
};

/** `@Roam` mentioned anywhere in the message — literal match, no NLP needed. */
export const ROAM_MENTION = /(^|\s)@roam\b/i;
export function mentionsRoam(content: string): boolean {
  return ROAM_MENTION.test(content);
}

/** How many messages the chat opens with. Anything older is fetched a page at a time ("Show earlier messages"). */
export const GROUP_HISTORY_LIMIT = 200;

/** "@Roam" with nothing after it asks nothing: only a real question is worth sending. */
export const hasAsk = (text: string) => text.replace(/(^|\s)@roam\b/gi, " ").trim().length > 0;
