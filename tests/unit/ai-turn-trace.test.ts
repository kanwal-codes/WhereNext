import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAiTurn, type AiTurnTrace } from "../../lib/server/ai-turn-trace";

const TRIP = "11111111-1111-4111-8111-111111111111";
const trace: AiTurnTrace = {
  intent: "nightlife", tools: ["search_places"], providers_failed: [], blocks: ["place_list"],
  tokens_in: 100, tokens_out: 50, cost_usd: 0.001, resolve_ms: 200, retrieve_ms: 300, compose_ms: 900, total_ms: 1400,
  model_resolve: "gpt-oss-120b", model_compose: "gpt-oss-120b", degraded: false,
};

/** A minimal fake matching the one call `recordAiTurn` makes: `.from(t).insert(row)` -> PromiseLike. */
function fakeSupabase(insert: (row: unknown) => unknown): SupabaseClient {
  return { from: () => ({ insert }) } as unknown as SupabaseClient;
}

describe("recordAiTurn", () => {
  it("inserts one row into ai_turn_traces with trip_id merged in", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    await recordAiTurn(fakeSupabase(insert), TRIP, trace);
    expect(insert).toHaveBeenCalledWith({ trip_id: TRIP, ...trace });
  });

  it("settles after the write so completed turns are immediately queryable", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    await expect(recordAiTurn(fakeSupabase(insert), TRIP, trace)).resolves.toBeUndefined();
  });

  it("swallows a rejected insert without throwing", async () => {
    const insert = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(recordAiTurn(fakeSupabase(insert), TRIP, trace)).resolves.toBeUndefined();
  });

  it("swallows an insert that returns an { error } shape", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "rls denied" } });
    await expect(recordAiTurn(fakeSupabase(insert), TRIP, trace)).resolves.toBeUndefined();
  });

  it("swallows a client that throws synchronously (missing table / wrong shape)", async () => {
    const bad = { from: () => { throw new Error("no such table"); } } as unknown as SupabaseClient;
    await expect(recordAiTurn(bad, TRIP, trace)).resolves.toBeUndefined();
  });

  it("swallows a client with no .insert method", async () => {
    const bad = { from: () => ({}) } as unknown as SupabaseClient;
    await expect(recordAiTurn(bad, TRIP, trace)).resolves.toBeUndefined();
  });
});
