import type { Message } from "../domain/message";

export function mergeConversationMessages(current: Message[], fresh: Message[]): Message[] {
  const byId = new Map(fresh.map((message) => [message.id, message]));
  // `current` is in the order the messages were sent. A local message carries the BROWSER's clock and a server row the
  // SERVER's, so sorting them together by time can put Roam's streaming reply above the question that caused it
  // whenever the two clocks differ by a second or two (a first message sent while the thread's load is still finishing
  // merges in exactly that state). So a message with no server row keeps its place after the one before it.
  let previous = -Infinity;
  for (let message of current) {
    const served = byId.get(message.id);
    if (served) {
      previous = Date.parse(served.created_at);
      continue;
    }
    // A locally-streamed message keeps its client-generated id, so it never matches the server
    // row by id. Both roles' local ids are deterministic from the turn's own send idempotency
    // key (`local-${key}` for the user's own echo, `local-assistant-${key}` for the reply
    // placeholder — see sendConversationMessage.ts), and the server row carries that same key
    // back (`user:${key}` / `assistant:${key}`, see scopedMessageIdempotencyKey) — matching on
    // that instead of content+timing means two genuinely identical messages/replies sent
    // moments apart each match their own row, rather than the second one matching the first's
    // already-confirmed twin and vanishing (or, under a slow/backed-up queue, surviving past
    // the old fixed 5-minute window as a visible duplicate).
    const userLocalKey = message.role === "user" && message.id.startsWith("local-") ? message.id.slice("local-".length) : null;
    const assistantLocalKey = message.role === "assistant" && message.id.startsWith("local-assistant-") ? message.id.slice("local-assistant-".length) : null;
    const twin = userLocalKey
      ? fresh.find((c) => c.role === "user" && c.idempotency_key === `user:${userLocalKey}`)
      : assistantLocalKey
        ? fresh.find((c) => c.role === "assistant" && c.idempotency_key === `assistant:${assistantLocalKey}`)
        : message.role === "user"
          ? fresh.find((c) => c.role === "user" && c.content === message.content && Math.abs(Date.parse(c.created_at) - Date.parse(message.created_at)) < 60_000)
          : message.content.trim().length > 0
            ? fresh.find((c) => c.role === "assistant" && c.content.trim() === message.content.trim() && Math.abs(Date.parse(c.created_at) - Date.parse(message.created_at)) < 5 * 60_000)
            : undefined;
    if (twin) {
      previous = Date.parse(twin.created_at);
      continue;
    }
    let at = Date.parse(message.created_at);
    if (!(at > previous)) {
      at = previous + 1;
      message = { ...message, created_at: new Date(at).toISOString() };
    }
    previous = at;
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}
