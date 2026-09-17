import { afterEach, describe, expect, it, vi } from "vitest";
import { sendConversationMessage } from "../../features/conversation/application/sendConversationMessage";

afterEach(() => vi.restoreAllMocks());

describe("sendConversationMessage", () => {
  it("sends one request to /api/ai (no separate persist round trip) and surfaces the turn metadata", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return Promise.resolve(new Response(
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n' +
        'data: {"meta":{"surface":"explore","blocks":[],"suggestedFollowups":[]}}\n\n' +
        "data: [DONE]\n\n",
        { status: 200 },
      ));
    }));

    const onSurfaceSelect = vi.fn();
    const onUserSaved = vi.fn();
    const onAssistantStart = vi.fn();
    const deltas: string[] = [];
    const { meta, content } = await sendConversationMessage({ tripId: "trip", content: "Find museums", onSurfaceSelect, onUserSaved, onAssistantStart, onAssistantDelta: (content) => deltas.push(content) });

    expect(calls).toEqual(["POST /api/ai"]);
    expect(onUserSaved).toHaveBeenCalledOnce();
    expect(onAssistantStart).toHaveBeenCalledOnce();
    expect(onSurfaceSelect).toHaveBeenCalledWith("explore");
    expect(deltas).toEqual(["hello"]);
    expect(meta?.surface).toBe("explore");
    expect(content).toBe("hello");
  });

  it("reuses a caller-supplied idempotency key instead of minting a fresh one — a retry must collapse into the original row, not duplicate it", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return Promise.resolve(new Response("data: [DONE]\n\n", { status: 200 }));
    }));
    const fixedKey = "retry-fixed-key";
    // First attempt and a simulated retry both pass the SAME key, as ConversationSurface's
    // retry button now does — /api/ai upserts on (thread, idempotency_key).
    await sendConversationMessage({ tripId: "trip", content: "Hello", idempotencyKey: fixedKey, onUserSaved: vi.fn(), onAssistantStart: vi.fn(), onAssistantDelta: vi.fn() }).catch(() => undefined);
    await sendConversationMessage({ tripId: "trip", content: "Hello", idempotencyKey: fixedKey, onUserSaved: vi.fn(), onAssistantStart: vi.fn(), onAssistantDelta: vi.fn() }).catch(() => undefined);
    expect(bodies).toHaveLength(2);
    const keys = bodies.map((b) => (JSON.parse(b) as { messageIdempotencyKey: string }).messageIdempotencyKey);
    expect(keys).toEqual([fixedKey, fixedKey]);
  });

  it("mints its own key when the caller doesn't supply one", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return Promise.resolve(new Response("data: [DONE]\n\n", { status: 200 }));
    }));
    await sendConversationMessage({ tripId: "trip", content: "Hello", onUserSaved: vi.fn(), onAssistantStart: vi.fn(), onAssistantDelta: vi.fn() }).catch(() => undefined);
    const key = (JSON.parse(bodies[0]) as { messageIdempotencyKey: string }).messageIdempotencyKey;
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("does not call onUserSaved when /api/ai fails before persisting (userSaved absent from the error body)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Your message didn't send" }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const onUserSaved = vi.fn();

    await expect(sendConversationMessage({ tripId: "trip", content: "Hello", onUserSaved, onAssistantStart: vi.fn(), onAssistantDelta: vi.fn() })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onUserSaved).not.toHaveBeenCalled();
  });

  it("still calls onUserSaved when the message was saved but the reply failed (userSaved: true on the error body)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Roam is unavailable right now.", userSaved: true }), { status: 503 })));
    const onUserSaved = vi.fn();

    await expect(sendConversationMessage({ tripId: "trip", content: "Hello", onUserSaved, onAssistantStart: vi.fn(), onAssistantDelta: vi.fn() })).rejects.toThrow();
    expect(onUserSaved).toHaveBeenCalledOnce();
  });

  it("forwards real backend progress frames to onProgress, in order, before any content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'data: {"progress":"resolve"}\n\n' +
      'data: {"progress":"retrieve"}\n\n' +
      'data: {"progress":"compose"}\n\n' +
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n' +
      'data: {"meta":{"surface":"chat","blocks":[],"suggestedFollowups":[]}}\n\n' +
      "data: [DONE]\n\n",
      { status: 200 },
    )));
    const stages: string[] = [];
    const deltas: string[] = [];
    await sendConversationMessage({
      tripId: "trip", content: "hey what's up", onUserSaved: vi.fn(), onAssistantStart: vi.fn(),
      onAssistantDelta: (c) => deltas.push(c), onProgress: (s) => stages.push(s),
    });
    expect(stages).toEqual(["resolve", "retrieve", "compose"]);
    expect(deltas).toEqual(["hi"]);
  });

  it("rejects an empty assistant stream with no blocks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n", { status: 200 })));
    await expect(sendConversationMessage({ tripId: "trip", content: "Hello", onUserSaved: vi.fn(), onAssistantStart: vi.fn(), onAssistantDelta: vi.fn() })).rejects.toThrow("empty response");
  });
});
