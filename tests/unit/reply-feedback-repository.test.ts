import { describe, expect, it, vi } from "vitest";
import { createReplyFeedbackRepository } from "@/features/conversation/infrastructure/replyFeedbackRepository";

/** A chainable stand-in for the supabase-js builder that records each call and resolves to `result`. */
function fake(result: { data?: unknown; error?: unknown }) {
  const log: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "upsert", "delete"]) chain[m] = (...a: unknown[]) => { log.push([m, a]); return chain; };
  chain.maybeSingle = async () => result;
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: result.data ?? null, error: result.error ?? null });
  return { client: { from: vi.fn(() => chain) } as never, log };
}

describe("reply feedback repository", () => {
  it("upserts one row per (message, user) on conflict", async () => {
    const { client, log } = fake({});
    await createReplyFeedbackRepository(client).rate("t", "u", "m", "down", "too long");
    const [, [row, options]] = log.find(([m]) => m === "upsert")!;
    expect(row).toMatchObject({ message_id: "m", user_id: "u", trip_id: "t", rating: "down", note: "too long" });
    expect(options).toEqual({ onConflict: "message_id,user_id" });
  });

  it("clears only the caller's own row", async () => {
    const { client, log } = fake({});
    await createReplyFeedbackRepository(client).clear("u", "m");
    expect(log).toEqual([["delete", []], ["eq", ["message_id", "m"]], ["eq", ["user_id", "u"]]]);
  });

  it("finds a reply by id, or by its send key when given a local id; assistant replies in this trip only", async () => {
    const byId = fake({ data: { id: "m" } });
    expect(await createReplyFeedbackRepository(byId.client).findReply("t", "22222222-2222-4222-8222-222222222222")).toBe("m");
    expect(byId.log).toContainEqual(["eq", ["id", "22222222-2222-4222-8222-222222222222"]]);
    expect(byId.log).toContainEqual(["eq", ["trip_id", "t"]]);
    expect(byId.log).toContainEqual(["eq", ["role", "assistant"]]);

    const byKey = fake({ data: null });
    expect(await createReplyFeedbackRepository(byKey.client).findReply("t", "local-assistant-abc")).toBeNull();
    expect(byKey.log).toContainEqual(["eq", ["idempotency_key", "assistant:abc"]]);
  });

  it("maps message id to rating for the caller", async () => {
    const { client } = fake({ data: [{ message_id: "a", rating: "up" }, { message_id: "b", rating: "down" }] });
    expect(await createReplyFeedbackRepository(client).ratingsFor("t", "u")).toEqual(new Map([["a", "up"], ["b", "down"]]));
  });
});
