import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fallbackRate } from "../../lib/application/fallback-rate";

/** A minimal fake matching the one query `fallbackRate` builds:
 *  `.from(t).select(c).gte(...).not(...)` -> PromiseLike<{ data, error }>. */
function fakeSupabase(result: { data?: unknown; error?: unknown }): SupabaseClient {
  const builder = {
    select: () => builder,
    gte: () => builder,
    not: () => Promise.resolve(result),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe("fallbackRate", () => {
  it("is 0 when every resolve call landed on the lead model", async () => {
    const rows = Array.from({ length: 5 }, () => ({ model_resolve: "claude-sonnet-5-5" }));
    const result = await fallbackRate(fakeSupabase({ data: rows }), 15);
    expect(result).toEqual({ total: 5, fallback: 0, rate: 0, pinnedModel: "claude-sonnet-5-5" });
  });

  it("counts rows that fell through to a different model as fallbacks", async () => {
    const rows = [
      { model_resolve: "claude-sonnet-5-5" },
      { model_resolve: "claude-haiku-5-5" },
      { model_resolve: "claude-haiku-4-5" },
      { model_resolve: "claude-sonnet-5-5" },
    ];
    const result = await fallbackRate(fakeSupabase({ data: rows }), 15);
    expect(result.total).toBe(4);
    expect(result.fallback).toBe(2);
    expect(result.rate).toBe(0.5);
  });

  it("is 0 with no rows in the window rather than dividing by zero", async () => {
    const result = await fallbackRate(fakeSupabase({ data: [] }), 15);
    expect(result).toEqual({ total: 0, fallback: 0, rate: 0, pinnedModel: "claude-sonnet-5-5" });
  });

  it("treats a missing data array the same as empty", async () => {
    const result = await fallbackRate(fakeSupabase({ data: null }), 15);
    expect(result.total).toBe(0);
  });

  it("throws when the query errors, so the cron route's catch can report it", async () => {
    await expect(fallbackRate(fakeSupabase({ error: { message: "db down" } }), 15)).rejects.toEqual({ message: "db down" });
  });
});
