import { describe, expect, it } from "vitest";
import { unansweredRoamAsks, type GroupMessage } from "@/features/group-chat/domain/message";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();
const msg = (id: string, over: Partial<GroupMessage> & { ago: number }): GroupMessage => ({ id, userId: "u1", role: "user", kind: "text", content: "@Roam hi", metadata: {}, created_at: at(over.ago), reactions: [], ...over });

describe("unansweredRoamAsks", () => {
  it("an ask under two minutes old is still being answered", () => {
    expect(unansweredRoamAsks([msg("a", { ago: 30 })], NOW)).toEqual({ waiting: ["a"], missed: [] });
  });

  it("an ask older than that with no reply is one Roam missed", () => {
    expect(unansweredRoamAsks([msg("a", { ago: 300 })], NOW)).toEqual({ waiting: [], missed: ["a"] });
  });

  it("a reply threaded to the ask settles it", () => {
    const ask = msg("a", { ago: 300 });
    const reply = msg("r", { ago: 280, role: "assistant", userId: null, content: "Hello", metadata: { replyToMessageId: "a" } });
    expect(unansweredRoamAsks([ask, reply], NOW)).toEqual({ waiting: [], missed: [] });
  });

  it("ignores messages that do not mention Roam, and asks older than a day", () => {
    const plain = msg("p", { ago: 300, content: "see you there" });
    const old = msg("o", { ago: 3 * 24 * 3600 });
    expect(unansweredRoamAsks([plain, old], NOW)).toEqual({ waiting: [], missed: [] });
  });

  it("ignores Roam's own messages and system lines", () => {
    const own = msg("x", { ago: 300, role: "assistant", userId: null, content: "@Roam notes" });
    expect(unansweredRoamAsks([own], NOW)).toEqual({ waiting: [], missed: [] });
  });
});
