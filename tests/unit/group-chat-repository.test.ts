import { describe, expect, it, vi } from "vitest";
import { createRecorder } from "../support/query-recorder";

const resolvePolls = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/poll", () => ({ resolvePolls: (...a: unknown[]) => resolvePolls(...a) }));

import { createGroupChatRepository } from "../../features/group-chat/infrastructure/groupChatRepository";

type Any = Record<string, any>;
const row = (id: string, over: Any = {}) => ({ id, user_id: "u1", role: "user", kind: "text", content: `m${id}`, metadata: {}, created_at: `2026-10-0${id}T10:00:00Z`, idempotency_key: null, ...over });
const rows = (n: number, start = 1) => Array.from({ length: n }, (_, i) => row(String(start + i)));

describe("list", () => {
  it("returns messages oldest first, however the database ordered them", async () => {
    const rec = createRecorder({ group_messages: [{ data: [row("3"), row("2"), row("1")] }], group_message_reactions: [{ data: [] }] });
    const messages = await createGroupChatRepository(rec.client).list("t1", "u1");
    expect(messages.map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("reads one trip, newest first with the id as tiebreaker, up to a page of 500", async () => {
    const rec = createRecorder({ group_messages: [{ data: [] }] });
    await createGroupChatRepository(rec.client).list("t1", "u1");
    expect(rec.of("group_messages", "eq")[0].args).toEqual(["trip_id", "t1"]);
    expect(rec.of("group_messages", "order").map((c) => c.args)).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(rec.of("group_messages", "range")[0].args).toEqual([0, 499]);
  });

  it("asks only for what is older than a given time", async () => {
    const rec = createRecorder({ group_messages: [{ data: [] }] });
    await createGroupChatRepository(rec.client).list("t1", "u1", { before: "2026-10-05T00:00:00Z" });
    expect(rec.of("group_messages", "lt")[0].args).toEqual(["created_at", "2026-10-05T00:00:00Z"]);
    const rec2 = createRecorder({ group_messages: [{ data: [] }] });
    await createGroupChatRepository(rec2.client).list("t1", "u1");
    expect(rec2.of("group_messages", "lt")).toHaveLength(0);
  });

  it("stops at the limit, asking for no more than that", async () => {
    const rec = createRecorder({ group_messages: [{ data: rows(3) }], group_message_reactions: [{ data: [] }] });
    await createGroupChatRepository(rec.client).list("t1", "u1", { limit: 3 });
    expect(rec.of("group_messages", "range").map((c) => c.args)).toEqual([[0, 2]]);
  });

  it("pages backwards when there are more than 500", async () => {
    const rec = createRecorder({ group_messages: [{ data: rows(500) }, { data: rows(2, 600) }], group_message_reactions: [{ data: [] }] });
    const messages = await createGroupChatRepository(rec.client).list("t1", "u1");
    expect(rec.of("group_messages", "range").map((c) => c.args)).toEqual([[0, 499], [500, 999]]);
    expect(messages).toHaveLength(502);
  });

  it("asks for a final short page only up to the limit", async () => {
    const rec = createRecorder({ group_messages: [{ data: rows(500) }, { data: rows(100, 700) }], group_message_reactions: [{ data: [] }] });
    await createGroupChatRepository(rec.client).list("t1", "u1", { limit: 600 });
    expect(rec.of("group_messages", "range").map((c) => c.args)).toEqual([[0, 499], [500, 599]]);
  });

  it("throws a database error rather than returning a partial thread", async () => {
    const rec = createRecorder({ group_messages: [{ error: new Error("rls") }] });
    await expect(createGroupChatRepository(rec.client).list("t1", "u1")).rejects.toThrow("rls");
  });

  it("tallies reactions per emoji and marks the viewer's own", async () => {
    const rec = createRecorder({
      group_messages: [{ data: [row("2"), row("1")] }],
      group_message_reactions: [{ data: [
        { message_id: "1", user_id: "u1", emoji: "👍" }, { message_id: "1", user_id: "u2", emoji: "👍" },
        { message_id: "1", user_id: "u2", emoji: "❤️" }, { message_id: "2", user_id: "u3", emoji: "👍" },
      ] }],
    });
    const [first, second] = await createGroupChatRepository(rec.client).list("t1", "u1");
    expect(first.reactions).toEqual([{ emoji: "👍", count: 2, mine: true }, { emoji: "❤️", count: 1, mine: false }]);
    expect(second.reactions).toEqual([{ emoji: "👍", count: 1, mine: false }]);
    expect(rec.of("group_message_reactions", "in")[0].args).toEqual(["message_id", ["1", "2"]]);
  });

  it("skips the reactions query for an empty thread, and fails on a reactions error", async () => {
    const empty = createRecorder({ group_messages: [{ data: [] }] });
    expect(await createGroupChatRepository(empty.client).list("t1", "u1")).toEqual([]);
    expect(empty.calls.some((c) => c.table === "group_message_reactions")).toBe(false);
    const bad = createRecorder({ group_messages: [{ data: [row("1")] }], group_message_reactions: [{ error: new Error("nope") }] });
    await expect(createGroupChatRepository(bad.client).list("t1", "u1")).rejects.toThrow("nope");
  });

  it("exposes a member's own send key but never Roam's reserved ones", async () => {
    const rec = createRecorder({ group_messages: [{ data: [row("3", { idempotency_key: "assistant:roam-reply:x:y" }), row("2", { idempotency_key: "user:abc" }), row("1")] }], group_message_reactions: [{ data: [] }] });
    const [a, b, c] = await createGroupChatRepository(rec.client).list("t1", "u1");
    expect(c).not.toHaveProperty("clientKey");
    expect(b.clientKey).toBe("abc");
    expect(a).not.toHaveProperty("clientKey");
  });

  it("maps the row to a message and slims its metadata", async () => {
    const big = { blocks: [{ type: "place_list", places: [{ name: "x", payload: "y".repeat(5000) }] }], replyToMessageId: "m9" };
    const rec = createRecorder({ group_messages: [{ data: [row("1", { user_id: null, role: "assistant", kind: "text", metadata: big })] }], group_message_reactions: [{ data: [] }] });
    const [m] = await createGroupChatRepository(rec.client).list("t1", "u1");
    expect(m).toMatchObject({ id: "1", userId: null, role: "assistant", kind: "text", content: "m1", created_at: "2026-10-01T10:00:00Z", reactions: [] });
    expect(m.metadata.replyToMessageId).toBe("m9");
  });

  it("embeds each poll's live tally and leaves other messages alone", async () => {
    resolvePolls.mockResolvedValueOnce(new Map([["p1", { question: "Where?", options: [] }]]));
    const rec = createRecorder({ group_messages: [{ data: [row("2"), row("1", { kind: "poll", metadata: { pollId: "p1" } })] }], group_message_reactions: [{ data: [] }] });
    const [poll, text] = await createGroupChatRepository(rec.client).list("t1", "viewer");
    expect(resolvePolls).toHaveBeenCalledWith(rec.client, ["p1"], "viewer");
    expect(poll.metadata.poll).toEqual({ question: "Where?", options: [] });
    expect(text.metadata).not.toHaveProperty("poll");
  });

  it("does not look up polls when there are none, or when a poll message has no id", async () => {
    resolvePolls.mockClear();
    const rec = createRecorder({ group_messages: [{ data: [row("1", { kind: "poll", metadata: {} })] }], group_message_reactions: [{ data: [] }] });
    await createGroupChatRepository(rec.client).list("t1", "u1");
    expect(resolvePolls).not.toHaveBeenCalled();
  });

  it("leaves a poll message as it is when its poll cannot be found", async () => {
    resolvePolls.mockResolvedValueOnce(new Map());
    const rec = createRecorder({ group_messages: [{ data: [row("1", { kind: "poll", metadata: { pollId: "gone" } })] }], group_message_reactions: [{ data: [] }] });
    const [m] = await createGroupChatRepository(rec.client).list("t1", "u1");
    expect(m.metadata).not.toHaveProperty("poll");
  });
});

describe("append", () => {
  const sent = { userId: "u1", role: "user" as const, kind: "text" as const, content: "hi" };

  it("inserts a plain message with no key", async () => {
    const rec = createRecorder({ group_messages: [{ data: row("1") }] });
    const message = await createGroupChatRepository(rec.client).append("t1", sent);
    expect(rec.of("group_messages", "insert")[0].args[0]).toEqual({ trip_id: "t1", user_id: "u1", role: "user", kind: "text", content: "hi", metadata: {}, idempotency_key: null });
    expect(rec.of("group_messages", "upsert")).toHaveLength(0);
    expect(message.id).toBe("1");
    expect(message.reactions).toEqual([]);
  });

  it("scopes a client key by the role the server decided, so it can never collide with Roam's reserved keys", async () => {
    const rec = createRecorder({ group_messages: [{ data: row("1") }] });
    await createGroupChatRepository(rec.client).append("t1", { ...sent, idempotencyKey: "abc" });
    const [written, options] = rec.of("group_messages", "upsert")[0].args as [Any, Any];
    expect(written.idempotency_key).toBe("user:abc");
    expect(options).toEqual({ onConflict: "trip_id,idempotency_key" });
    expect(rec.of("group_messages", "insert")).toHaveLength(0);
  });

  it("writes Roam's reply under the assistant scope with its metadata", async () => {
    const rec = createRecorder({ group_messages: [{ data: row("1", { role: "assistant", user_id: null }) }] });
    await createGroupChatRepository(rec.client).append("t1", { userId: null, role: "assistant", kind: "text", content: "ok", metadata: { replyToMessageId: "m1" }, idempotencyKey: "roam-reply:m1:u1" });
    expect(rec.of("group_messages", "upsert")[0].args[0]).toMatchObject({ user_id: null, role: "assistant", idempotency_key: "assistant:roam-reply:m1:u1", metadata: { replyToMessageId: "m1" } });
  });

  it("throws when the write fails", async () => {
    const rec = createRecorder({ group_messages: [{ error: new Error("rls denied") }] });
    await expect(createGroupChatRepository(rec.client).append("t1", sent)).rejects.toThrow("rls denied");
  });
});

describe("getById", () => {
  it("finds one message of the trip with its reactions", async () => {
    const rec = createRecorder({ group_messages: [{ data: row("1") }], group_message_reactions: [{ data: [{ message_id: "1", user_id: "me", emoji: "👍" }] }] });
    const m = await createGroupChatRepository(rec.client).getById("t1", "1", "me");
    expect(rec.of("group_messages", "eq").map((c) => c.args)).toEqual([["trip_id", "t1"], ["id", "1"]]);
    expect(m?.reactions).toEqual([{ emoji: "👍", count: 1, mine: true }]);
  });

  it("is null for a message that is not there, without asking for reactions", async () => {
    const rec = createRecorder({ group_messages: [{ data: null }] });
    expect(await createGroupChatRepository(rec.client).getById("t1", "9", "me")).toBeNull();
    expect(rec.calls.some((c) => c.table === "group_message_reactions")).toBe(false);
  });

  it("throws on a database error", async () => {
    const rec = createRecorder({ group_messages: [{ error: new Error("boom") }] });
    await expect(createGroupChatRepository(rec.client).getById("t1", "1", "me")).rejects.toThrow("boom");
  });

  it("embeds a poll's live tally", async () => {
    resolvePolls.mockResolvedValueOnce(new Map([["p1", { question: "Q" }]]));
    const rec = createRecorder({ group_messages: [{ data: row("1", { kind: "poll", metadata: { pollId: "p1" } }) }], group_message_reactions: [{ data: [] }] });
    expect((await createGroupChatRepository(rec.client).getById("t1", "1", "me"))?.metadata.poll).toEqual({ question: "Q" });
  });
});

describe("getByIdempotencyKey", () => {
  it("looks a row up under the same scoped key append stores it under", async () => {
    const rec = createRecorder({ group_messages: [{ data: row("1", { role: "assistant" }) }] });
    const m = await createGroupChatRepository(rec.client).getByIdempotencyKey("t1", "assistant", "roam-reply:m1:u1");
    expect(rec.of("group_messages", "eq").map((c) => c.args)).toEqual([["trip_id", "t1"], ["idempotency_key", "assistant:roam-reply:m1:u1"]]);
    expect(m?.id).toBe("1");
  });

  it("is null when nothing was written, and throws on an error", async () => {
    expect(await createGroupChatRepository(createRecorder({ group_messages: [{ data: null }] }).client).getByIdempotencyKey("t1", "user", "k")).toBeNull();
    await expect(createGroupChatRepository(createRecorder({ group_messages: [{ error: new Error("x") }] }).client).getByIdempotencyKey("t1", "user", "k")).rejects.toThrow("x");
  });
});
