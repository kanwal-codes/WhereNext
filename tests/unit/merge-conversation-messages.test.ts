import { describe, expect, it } from "vitest";
import { mergeConversationMessages } from "../../features/conversation/ui/ConversationSurface";
import type { Message } from "../../features/conversation/domain/message";

const msg = (over: Partial<Message>): Message => ({
  id: "x",
  role: "assistant",
  content: "",
  created_at: "2026-09-04T12:00:00.000Z",
  ...over,
});

describe("mergeConversationMessages", () => {
  it("drops a locally-streamed assistant turn once its server twin arrives (no double render)", () => {
    const local = msg({ id: "local-uuid", role: "assistant", content: "Yebba is a soul singer.", created_at: "2026-09-04T12:00:05.000Z" });
    const server = msg({ id: "db-42", role: "assistant", content: "Yebba is a soul singer.", created_at: "2026-09-04T12:00:40.000Z" });
    const merged = mergeConversationMessages([local], [server]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("db-42");
  });

  it("keeps a still-streaming (empty) assistant message that has no server row yet", () => {
    const streaming = msg({ id: "local-uuid", role: "assistant", content: "" });
    expect(mergeConversationMessages([streaming], [])).toHaveLength(1);
  });

  it("keeps distinct assistant turns and dedupes the user echo", () => {
    const localUser = msg({ id: "local-1", role: "user", content: "hi", created_at: "2026-09-04T12:00:00.000Z" });
    const serverUser = msg({ id: "db-1", role: "user", content: "hi", created_at: "2026-09-04T12:00:01.000Z", idempotency_key: "user:1" });
    const serverReply = msg({ id: "db-2", role: "assistant", content: "hello there", created_at: "2026-09-04T12:00:20.000Z" });
    const merged = mergeConversationMessages([localUser], [serverUser, serverReply]);
    expect(merged.map((m) => m.id)).toEqual(["db-1", "db-2"]);
  });

  it("matches a user echo to its own row by idempotency key, not the first identical-text send", () => {
    // Two genuinely distinct sends of the same text, moments apart — the second's local bubble
    // must match its OWN server row (key "2"), not send #1's already-confirmed row (key "1"),
    // which content+timing alone can't tell apart.
    const localSecond = msg({ id: "local-2", role: "user", content: "hi", created_at: "2026-09-04T12:00:00.500Z" });
    const serverFirst = msg({ id: "db-1", role: "user", content: "hi", created_at: "2026-09-04T12:00:00.000Z", idempotency_key: "user:1" });
    const merged = mergeConversationMessages([localSecond], [serverFirst]);
    // Send #2's server row hasn't landed yet — it must stay visible under its own local id,
    // not get silently dropped as if it were send #1.
    expect(merged.map((m) => m.id)).toEqual(["db-1", "local-2"]);
  });

  it("matches an assistant placeholder to its own row by idempotency key, not a fixed time window", () => {
    // The old content+timing heuristic used a 5-minute window — under a backed-up per-trip AI
    // queue a turn can genuinely take longer than that to persist, which would have produced a
    // visible duplicate bubble. Key-based matching has no such window.
    const local = msg({ id: "local-assistant-abc", role: "assistant", content: "The museum opens at 9am.", created_at: "2026-09-04T12:00:00.000Z" });
    const server = msg({ id: "db-9", role: "assistant", content: "The museum opens at 9am.", created_at: "2026-09-04T12:10:00.000Z", idempotency_key: "assistant:abc" });
    const merged = mergeConversationMessages([local], [server]);
    expect(merged.map((m) => m.id)).toEqual(["db-9"]);
  });

  it("does not match an assistant placeholder to a different turn's row that happens to share text", () => {
    const local = msg({ id: "local-assistant-second", role: "assistant", content: "Sure!", created_at: "2026-09-04T12:00:00.500Z" });
    const server = msg({ id: "db-1", role: "assistant", content: "Sure!", created_at: "2026-09-04T12:00:00.000Z", idempotency_key: "assistant:first" });
    const merged = mergeConversationMessages([local], [server]);
    expect(merged.map((m) => m.id)).toEqual(["db-1", "local-assistant-second"]);
  });
});
