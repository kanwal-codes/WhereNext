import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshThreadSummary } from "../../lib/application/thread-summary";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
});

function fakeSupabase(options: { existingSummary?: string | null; cursorAt?: string | null; messageCount?: number } = {}) {
  const rows = messages(options.messageCount ?? 20).map((message, index) => ({
    id: `m-${index}`,
    ...message,
    created_at: `2026-09-04T00:${String(index).padStart(2, "0")}:00.000Z`,
  }));
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "conversation_threads") {
        const selectQuery = {
          eq: () => selectQuery,
          maybeSingle: async () => ({
            data: {
              id: "thread-1",
              summary: options.existingSummary ?? null,
              summarized_through_message_id: null,
              summarized_through_created_at: options.cursorAt ?? null,
            },
            error: null,
          }),
        };
        return {
          select: () => selectQuery,
          update,
        };
      }
      const query = {
        gt: vi.fn(() => query),
        limit: vi.fn(async () => ({
          data: options.cursorAt ? rows.slice(12) : rows,
          error: null,
        })),
        order: vi.fn(() => query),
        eq: vi.fn(() => query),
        select: vi.fn(() => query),
      };
      return query;
    }),
  };
  return { supabase: supabase as never, update };
}
const messages = (count: number) => Array.from({ length: count }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `m${index}` }));

describe("refreshThreadSummary", () => {
  it("does nothing below the threshold", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { supabase, update } = fakeSupabase({ messageCount: 12 });
    await refreshThreadSummary(supabase, "t", "u1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("waits for a small incremental batch when a summary already exists", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { supabase } = fakeSupabase({ existingSummary: "Travelling with friends.", cursorAt: "2026-09-04T00:16:00.000Z", messageCount: 18 });
    await refreshThreadSummary(supabase, "t", "u1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("summarizes an ordinary completed-turn transcript and writes the cursor", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "  5 friends, into nightlife, no museums, focused on Shanghai.  " } }] }), { status: 200 })));
    const { supabase, update } = fakeSupabase();
    await refreshThreadSummary(supabase, "t", "u1");
    expect(update).toHaveBeenCalledWith({
      summary: "5 friends, into nightlife, no museums, focused on Shanghai.",
      summarized_through_message_id: "m-19",
      summarized_through_created_at: "2026-09-04T00:19:00.000Z",
    });
  });

  it("carries the previous memory into the next rolling summary", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "k";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Montreal trip, now solo, likes food and art." } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { supabase } = fakeSupabase({ existingSummary: "Montreal trip with friends, likes nightlife.", cursorAt: "2026-09-04T00:11:00.000Z", messageCount: 20 });
    await refreshThreadSummary(supabase, "t", "u1");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { messages: Array<{ content: string }> };
    expect(body.messages.at(-1)?.content).toContain("Previous memory:");
    expect(body.messages.at(-1)?.content).toContain("Montreal trip with friends");
  });

  it("swallows a provider failure", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 500 })));
    const { supabase, update } = fakeSupabase();
    await expect(refreshThreadSummary(supabase, "t", "u1")).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});
