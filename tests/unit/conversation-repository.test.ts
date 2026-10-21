import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRecorder } from "../support/query-recorder";

const invalidateWorkspace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/workspace-cache", () => ({ invalidateWorkspace }));

import { createConversationRepository, scopedMessageIdempotencyKey } from "../../features/conversation/infrastructure/conversationRepository";

type Any = Record<string, any>;
const msg = (id: string, over: Any = {}) => ({ id, role: "user", content: `m${id}`, idempotency_key: null, created_at: `2026-10-0${id}T10:00:00Z`, metadata: {}, ...over });
const THREAD = { data: { id: "th1" } };
beforeEach(() => invalidateWorkspace.mockClear());

describe("scopedMessageIdempotencyKey", () => {
  it("prefixes a key with the role, and is null without one", () => {
    expect(scopedMessageIdempotencyKey("user", "abc")).toBe("user:abc");
    expect(scopedMessageIdempotencyKey("assistant", "abc")).toBe("assistant:abc");
    expect(scopedMessageIdempotencyKey("user")).toBeNull();
    expect(scopedMessageIdempotencyKey("user", "")).toBeNull();
  });
});

describe("the thread", () => {
  it("uses the member's existing thread", async () => {
    const rec = createRecorder({ conversation_threads: [THREAD], conversation_messages: [{ data: [] }] });
    await createConversationRepository(rec.client).list("t1", "u1");
    expect(rec.of("conversation_threads", "eq").map((c) => c.args)).toEqual([["trip_id", "t1"], ["user_id", "u1"]]);
    expect(rec.of("conversation_threads", "upsert")).toHaveLength(0);
    expect(rec.of("conversation_messages", "eq")[0].args).toEqual(["thread_id", "th1"]);
  });

  it("creates it with the writer client when there is none, ignoring a duplicate", async () => {
    const user = createRecorder({ conversation_threads: [{ data: null }], conversation_messages: [{ data: [] }] });
    const writer = createRecorder({ conversation_threads: [{ data: { id: "new" } }] });
    await createConversationRepository(user.client, writer.client).list("t1", "u1");
    expect(writer.of("conversation_threads", "upsert")[0].args).toEqual([{ trip_id: "t1", user_id: "u1" }, { onConflict: "trip_id,user_id", ignoreDuplicates: true }]);
    expect(user.of("conversation_threads", "upsert")).toHaveLength(0);
    expect(user.of("conversation_messages", "eq")[0].args).toEqual(["thread_id", "new"]);
  });

  it("writes the thread with the user's own client when no separate writer is given", async () => {
    const rec = createRecorder({ conversation_threads: [{ data: null }, { data: { id: "new" } }], conversation_messages: [{ data: [] }] });
    await createConversationRepository(rec.client).list("t1", "u1");
    expect(rec.of("conversation_threads", "upsert")).toHaveLength(1);
  });

  it("reads it back when a concurrent request created it first", async () => {
    const user = createRecorder({ conversation_threads: [{ data: null }, { data: { id: "raced" } }], conversation_messages: [{ data: [] }] });
    const writer = createRecorder({ conversation_threads: [{ data: null }] });
    await createConversationRepository(user.client, writer.client).list("t1", "u1");
    expect(user.of("conversation_messages", "eq")[0].args).toEqual(["thread_id", "raced"]);
  });

  it("throws when the lookup, the create or the re-read fails", async () => {
    await expect(createConversationRepository(createRecorder({ conversation_threads: [{ error: new Error("a") }] }).client).list("t1", "u1")).rejects.toThrow("a");
    const w = createRecorder({ conversation_threads: [{ error: new Error("b") }] });
    await expect(createConversationRepository(createRecorder({ conversation_threads: [{ data: null }] }).client, w.client).list("t1", "u1")).rejects.toThrow("b");
    const w2 = createRecorder({ conversation_threads: [{ data: null }] });
    await expect(createConversationRepository(createRecorder({ conversation_threads: [{ data: null }, { error: new Error("c") }] }).client, w2.client).list("t1", "u1")).rejects.toThrow("c");
  });
});

describe("list", () => {
  it("returns the thread oldest first, newest-first paged with the id as tiebreaker", async () => {
    const rec = createRecorder({ conversation_threads: [THREAD], conversation_messages: [{ data: [msg("3"), msg("2"), msg("1")] }] });
    const out = await createConversationRepository(rec.client).list("t1", "u1");
    expect(out.map((m) => m.id)).toEqual(["1", "2", "3"]);
    expect(rec.of("conversation_messages", "order").map((c) => c.args)).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(rec.of("conversation_messages", "range")[0].args).toEqual([0, 499]);
  });

  it("stops at the limit", async () => {
    const rec = createRecorder({ conversation_threads: [THREAD], conversation_messages: [{ data: [msg("2"), msg("1")] }] });
    await createConversationRepository(rec.client).list("t1", "u1", { limit: 2 });
    expect(rec.of("conversation_messages", "range").map((c) => c.args)).toEqual([[0, 1]]);
  });

  it("pages when the thread is longer than 500", async () => {
    const page = Array.from({ length: 500 }, (_, i) => msg(String(i + 1)));
    const rec = createRecorder({ conversation_threads: [THREAD], conversation_messages: [{ data: page }, { data: [msg("9")] }] });
    const out = await createConversationRepository(rec.client).list("t1", "u1");
    expect(rec.of("conversation_messages", "range").map((c) => c.args)).toEqual([[0, 499], [500, 999]]);
    expect(out).toHaveLength(501);
  });

  it("throws on a read error", async () => {
    const rec = createRecorder({ conversation_threads: [THREAD], conversation_messages: [{ error: new Error("rls") }] });
    await expect(createConversationRepository(rec.client).list("t1", "u1")).rejects.toThrow("rls");
  });

  it("slims the metadata of every message", async () => {
    const rec = createRecorder({ conversation_threads: [THREAD], conversation_messages: [{ data: [msg("1", { metadata: null })] }] });
    const [m] = await createConversationRepository(rec.client).list("t1", "u1");
    expect(m.metadata).toEqual({});
  });
});

describe("append", () => {
  const input = { role: "user" as const, content: "hello" };

  it("inserts a keyless message and refreshes the workspace", async () => {
    const rec = createRecorder({ conversation_threads: [THREAD], conversation_messages: [{ data: msg("1") }] });
    const out = await createConversationRepository(rec.client).append("t1", "u1", input);
    expect(rec.of("conversation_messages", "insert")[0].args[0]).toEqual({ thread_id: "th1", role: "user", content: "hello", idempotency_key: null, metadata: {} });
    expect(rec.of("conversation_messages", "upsert")).toHaveLength(0);
    expect(out.id).toBe("1");
    expect(invalidateWorkspace).toHaveBeenCalledWith("t1");
  });

  it("upserts under the role-scoped key so a retry lands on the same row", async () => {
    const rec = createRecorder({ conversation_threads: [THREAD], conversation_messages: [{ data: msg("1") }] });
    await createConversationRepository(rec.client).append("t1", "u1", { ...input, idempotencyKey: "k1", metadata: { a: 1 } });
    const [row, options] = rec.of("conversation_messages", "upsert")[0].args as [Any, Any];
    expect(row).toMatchObject({ idempotency_key: "user:k1", metadata: { a: 1 } });
    expect(options).toEqual({ onConflict: "thread_id,idempotency_key" });
  });

  it("keeps a user's key and the assistant's from colliding", async () => {
    const a = createRecorder({ conversation_threads: [THREAD], conversation_messages: [{ data: msg("1") }] });
    await createConversationRepository(a.client).append("t1", "u1", { role: "assistant", content: "x", idempotencyKey: "k" });
    expect((a.of("conversation_messages", "upsert")[0].args[0] as Any).idempotency_key).toBe("assistant:k");
  });

  it("does not refresh the workspace when the write fails", async () => {
    const rec = createRecorder({ conversation_threads: [THREAD], conversation_messages: [{ error: new Error("denied") }] });
    await expect(createConversationRepository(rec.client).append("t1", "u1", input)).rejects.toThrow("denied");
    expect(invalidateWorkspace).not.toHaveBeenCalled();
  });
});
