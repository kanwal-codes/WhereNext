import { z } from "zod";
import { boundedRecord } from "@/packages/contracts/shared";

/** The longest message the server accepts. The composer stops at the same number. */
export const MAX_MESSAGE_LENGTH = 4000;

export const groupMessageInput = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
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
  /** For a member's own message: the key their device sent it under, so an unsent copy of it can be recognised as delivered. */
  clientKey?: string;
};

/** `@Roam` mentioned anywhere in the message — literal match, no NLP needed. */
export const ROAM_MENTION = /(^|\s)@roam\b/i;
export function mentionsRoam(content: string): boolean {
  return ROAM_MENTION.test(content);
}

/**
 * How many messages the chat opens with; anything older loads a page at a time as you scroll up. Also the
 * size of the history every trip page's server payload carries (the workspace snapshot), refetched after every
 * change anywhere in the trip: 200 made that ~240 KB of chat on pages that never show it.
 */
export const GROUP_HISTORY_LIMIT = 40;

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

/** An @Roam ask with no reply yet counts as "being answered" for this long, then as one Roam did not answer. */
export const ROAM_WAIT_MS = 120_000;
/** A missed ask keeps its "Retry" for this long; older ones are history. */
const ROAM_RETRY_WINDOW_MS = 24 * 60 * 60_000;

/** The @Roam asks nobody has answered, split by age: still waiting on a reply, or given up on (Roam never replied, so offer a retry). */
export function unansweredRoamAsks(messages: GroupMessage[], now: number): { waiting: string[]; missed: string[] } {
  const answered = new Set(messages.filter((m) => m.role === "assistant").map((m) => (m.metadata as { replyToMessageId?: string } | undefined)?.replyToMessageId));
  const waiting: string[] = [];
  const missed: string[] = [];
  for (const m of messages) {
    if (m.role !== "user" || !mentionsRoam(m.content) || answered.has(m.id)) continue;
    const age = now - Date.parse(m.created_at);
    if (age < ROAM_WAIT_MS) waiting.push(m.id);
    else if (age < ROAM_RETRY_WINDOW_MS) missed.push(m.id);
  }
  return { waiting, missed };
}
