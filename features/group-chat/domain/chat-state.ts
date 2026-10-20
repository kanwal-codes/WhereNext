import type { Poll } from "@/packages/contracts/poll";
import { MAX_MESSAGE_LENGTH, type GroupMessage } from "./message";
import type { Outgoing } from "./outbox";

/** Same sender, close enough in time to read as one turn: collapses the repeated avatar and name. */
export const GROUP_WINDOW_MS = 5 * 60_000;

/** This member's vote, applied to the list at once (the server's realtime change confirms or corrects it a moment later).
 *  Picking another option moves the vote; picking your current one changes nothing; a first vote adds one to the total. */
export function applyVote(messages: GroupMessage[], messageId: string, optionKey: string): GroupMessage[] {
  return messages.map((m) => {
    const poll = (m.metadata as { poll?: Poll } | undefined)?.poll;
    if (m.id !== messageId || !poll) return m;
    const already = poll.options.find((o) => o.mine);
    const options = poll.options.map((o) => ({
      ...o,
      mine: o.key === optionKey,
      count: o.key === optionKey ? o.count + (already?.key === optionKey ? 0 : 1) : o.key === already?.key ? o.count - 1 : o.count,
    }));
    return { ...m, metadata: { ...m.metadata, poll: { ...poll, options, totalVotes: already ? poll.totalVotes : poll.totalVotes + 1 } } };
  });
}

/** Tap an emoji: add yours, or take it back if you already reacted. An emoji nobody holds any more disappears. */
export function applyReactionToggle(messages: GroupMessage[], messageId: string, emoji: string): GroupMessage[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const existing = m.reactions.find((r) => r.emoji === emoji);
    const reactions = existing
      ? existing.mine
        ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) => r.count > 0)
        : m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r))
      : [...m.reactions, { emoji, count: 1, mine: true }];
    return { ...m, reactions };
  });
}

export type ChatRow = {
  message: GroupMessage & { local?: Outgoing };
  showDateDivider: boolean;
  isFirstInGroup: boolean;
};

/**
 * What the log lays out, top to bottom: older pages, the newest `windowSize` confirmed messages, then your unsent ones
 * (shaped like any other so they group, divide and align the same way; one already delivered under its key is not repeated).
 * Each row knows whether a date divider precedes it and whether it starts a run by a new sender.
 * `dayKey` names the calendar day of a timestamp: two messages with different keys get a divider between them.
 */
export function buildRows(input: {
  older: GroupMessage[];
  messages: GroupMessage[];
  outbox: Outgoing[];
  windowSize: number;
  meUserId: string | null | undefined;
  dayKey: (iso: string) => string;
}): ChatRow[] {
  const { older, messages, outbox, windowSize, meUserId, dayKey } = input;
  const delivered = new Set(messages.map((m) => m.clientKey).filter(Boolean));
  const pending = outbox
    .filter((o) => !delivered.has(o.key))
    .map((o): GroupMessage & { local: Outgoing } => ({ id: `out-${o.key}`, userId: meUserId ?? null, role: "user", kind: "text", content: o.content, metadata: {}, created_at: o.created_at, reactions: [], local: o }));
  const all: Array<GroupMessage & { local?: Outgoing }> = [...older, ...messages.slice(Math.max(0, messages.length - windowSize)), ...pending];
  return all.map((message, index) => {
    const previous = all[index - 1];
    const showDateDivider = !previous || dayKey(previous.created_at) !== dayKey(message.created_at);
    const sameSenderAsPrevious =
      previous &&
      previous.kind !== "system" &&
      message.kind !== "system" &&
      previous.userId === message.userId &&
      previous.role === message.role &&
      Date.parse(message.created_at) - Date.parse(previous.created_at) < GROUP_WINDOW_MS;
    return { message, showDateDivider, isFirstInGroup: !sameSenderAsPrevious || showDateDivider };
  });
}

/** Roam's most recent message in the thread: the only one whose follow-up chips are still live. */
export function lastRoamMessageId(messages: GroupMessage[]): string | null {
  return [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;
}

/** The ghost text offered while typing a mention: "@r" -> "oam", "@roam" -> "" (nothing left, though Tab still tidies the case
 *  and adds the space). `active` is false when the end of the input is not a half-typed "@Roam". */
export function roamMentionGhost(input: string): { active: boolean; ghost: string } {
  const token = input.match(/(^|\s)(@[a-zA-Z]{0,4})$/)?.[2];
  const active = Boolean(token && "@roam".startsWith(token.toLowerCase()) && input.trim().length > 0);
  return { active, ghost: active && token ? "Roam".slice(token.length - 1) : "" };
}

export type ChatNotice = { text: string; action?: "retry" };

/** The one quiet line above the composer for whatever is making the chat unreliable right now, most important first. */
export function chatNotice(state: { online: boolean; loadFailed: boolean; hasMessages: boolean; liveDown: boolean; inputLength: number }): ChatNotice | null {
  if (!state.online) return { text: "You’re offline. Messages wait here and send when you’re back." };
  if (state.loadFailed && state.hasMessages) return { text: "Couldn’t refresh the chat. What you see may be out of date.", action: "retry" };
  if (state.liveDown) return { text: "Live updates are paused. New messages may take up to 30 seconds." };
  if (state.inputLength >= MAX_MESSAGE_LENGTH - 500) return { text: `${state.inputLength.toLocaleString()} of ${MAX_MESSAGE_LENGTH.toLocaleString()} characters` };
  return null;
}
