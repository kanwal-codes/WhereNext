import type { Message } from "./message";

/** What to tell the traveller when a send fails. `userSaved`: their message reached the server even though the reply did not. */
export function sendFailureToast(state: { userSaved: boolean; aiError: boolean; status?: number }): string {
  if (!state.userSaved) return "Your message didn’t send.";
  return state.aiError && state.status === 429 ? "Roam is busy right now — your message is saved." : "Roam couldn’t reply — your message is saved.";
}

/** How long a saved user message may sit without an answer before the screen offers to ask again (the connection dropped
 *  before the reply was saved: tab closed, phone locked). */
const UNANSWERED_AFTER_MS = 45_000;

/** The last message, when it is the traveller's, was saved by the server (not a local placeholder), carries a key to re-send
 *  under, and has waited long enough with nothing to show: the one to offer "Try again" for. Otherwise null. */
export function unansweredMessage(state: { messages: Message[]; loaded: boolean; sending: boolean; queued: boolean; now: number }): Message | null {
  const last = state.messages[state.messages.length - 1];
  if (!state.loaded || state.sending || state.queued || last?.role !== "user") return null;
  if (String(last.id).startsWith("local-")) return null;
  if (typeof last.idempotency_key !== "string" || !last.idempotency_key.startsWith("user:")) return null;
  return state.now - new Date(last.created_at).getTime() > UNANSWERED_AFTER_MS ? last : null;
}
