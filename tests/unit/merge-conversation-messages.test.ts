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
    const serverUser = msg({ id: "db-1", role: "user", content: "hi", created_at: "2026-09-04T12:00:01.000Z" });
    const serverReply = msg({ id: "db-2", role: "assistant", content: "hello there", created_at: "2026-09-04T12:00:20.000Z" });
    const merged = mergeConversationMessages([localUser], [serverUser, serverReply]);
    expect(merged.map((m) => m.id)).toEqual(["db-1", "db-2"]);
  });
});
