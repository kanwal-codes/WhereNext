import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshThreadSummary } from "../../lib/application/thread-summary";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
});

function fakeSupabase() {
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  return { supabase: { from: () => ({ update }) } as never, update };
}
const messages = (count: number) => Array.from({ length: count }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `m${index}` }));

describe("refreshThreadSummary", () => {
  it("does nothing below the threshold", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { supabase, update } = fakeSupabase();
    await refreshThreadSummary(supabase, "t", messages(12));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("does nothing off the refresh cadence", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { supabase } = fakeSupabase();
    await refreshThreadSummary(supabase, "t", messages(18));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("summarizes and writes on cadence", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "  5 friends, into nightlife, no museums, focused on Shanghai.  " } }] }), { status: 200 })));
    const { supabase, update } = fakeSupabase();
    await refreshThreadSummary(supabase, "t", messages(20));
    expect(update).toHaveBeenCalledWith({ summary: "5 friends, into nightlife, no museums, focused on Shanghai." });
  });

  it("swallows a provider failure", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 500 })));
    const { supabase, update } = fakeSupabase();
    await expect(refreshThreadSummary(supabase, "t", messages(20))).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});
