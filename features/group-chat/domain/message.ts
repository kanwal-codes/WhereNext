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

/** What Roam may read when it answers one specific message: the thread up to and including that message, nothing later.
 *  Several members can @Roam at once, so by the time a reply is composed the history already holds the others' later
 *  questions; left in, the newest one becomes "the question" and the reply answers it while the cards (found for the
 *  target's own text) belong to another. `target` is appended when it has aged out of the fetched page. */
export function historyThrough<M extends { id: string; created_at: string }>(history: M[], target: M): M[] {
  const at = history.findIndex((message) => message.id === target.id);
  if (at >= 0) return history.slice(0, at + 1);
  return [...history.filter((message) => message.created_at < target.created_at), target];
}

/** Typing "@r", "@ro" … then a space turns the half-typed mention into "@Roam " (a phone has no Tab to accept the ghost text).
 *  Only the one space just typed after the token counts; `previous` is what was in the box a moment ago. */
export function completeRoamMention(previous: string, next: string): string {
  if (next !== `${previous} ` || previous.length === 0) return next;
  const token = previous.match(/(^|\s)(@(?:r|ro|roa|roam))$/i);
  if (!token) return next;
  return `${previous.slice(0, previous.length - token[2].length)}@Roam `;
}
