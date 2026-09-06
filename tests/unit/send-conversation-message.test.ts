import { afterEach, describe, expect, it, vi } from "vitest";
import { sendConversationMessage } from "../../features/conversation/application/sendConversationMessage";

afterEach(() => vi.restoreAllMocks());

describe("sendConversationMessage", () => {
  it("persists the user message before streaming and surfaces the turn metadata", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/conversation")) return Promise.resolve(new Response("{}", { status: 201 }));
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

    expect(calls.filter((call) => call.startsWith("POST ")).map((call) => call.split(" ")[1])).toEqual(["/api/trips/trip/conversation", "/api/ai"]);
    expect(onUserSaved).toHaveBeenCalledOnce();
    expect(onAssistantStart).toHaveBeenCalledOnce();
    expect(onSurfaceSelect).toHaveBeenCalledWith("explore");
    expect(deltas).toEqual(["hello"]);
    expect(meta?.surface).toBe("explore");
    expect(content).toBe("hello");
  });

  it("reuses a caller-supplied idempotency key instead of minting a fresh one — a retry must collapse into the original row, not duplicate it", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/conversation")) {
        bodies.push(String(init?.body));
        return Promise.resolve(new Response("{}", { status: 201 }));
      }
      return Promise.resolve(new Response("data: [DONE]\n\n", { status: 200 }));
    }));
    const fixedKey = "retry-fixed-key";
    // First attempt and a simulated retry both pass the SAME key, as ConversationSurface's
    // retry button now does — the server upserts on (thread, idempotency_key).
    await sendConversationMessage({ tripId: "trip", content: "Hello", idempotencyKey: fixedKey, onUserSaved: vi.fn(), onAssistantStart: vi.fn(), onAssistantDelta: vi.fn() }).catch(() => undefined);
    await sendConversationMessage({ tripId: "trip", content: "Hello", idempotencyKey: fixedKey, onUserSaved: vi.fn(), onAssistantStart: vi.fn(), onAssistantDelta: vi.fn() }).catch(() => undefined);
    expect(bodies).toHaveLength(2);
    const keys = bodies.map((b) => (JSON.parse(b) as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual([fixedKey, fixedKey]);
  });

  it("mints its own key when the caller doesn't supply one", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/conversation")) {
        bodies.push(String(init?.body));
        return Promise.resolve(new Response("{}", { status: 201 }));
      }
      return Promise.resolve(new Response("data: [DONE]\n\n", { status: 200 }));
    }));
    await sendConversationMessage({ tripId: "trip", content: "Hello", onUserSaved: vi.fn(), onAssistantStart: vi.fn(), onAssistantDelta: vi.fn() }).catch(() => undefined);
    const key = (JSON.parse(bodies[0]) as { idempotencyKey: string }).idempotencyKey;
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("does not call AI when the user message cannot be persisted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("save failed", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendConversationMessage({ tripId: "trip", content: "Hello", onUserSaved: vi.fn(), onAssistantStart: vi.fn(), onAssistantDelta: vi.fn() })).rejects.toThrow("save");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects an empty assistant stream with no blocks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/conversation")) return Promise.resolve(new Response("{}", { status: 201 }));
      return Promise.resolve(new Response("data: [DONE]\n\n", { status: 200 }));
    }));
    await expect(sendConversationMessage({ tripId: "trip", content: "Hello", onUserSaved: vi.fn(), onAssistantStart: vi.fn(), onAssistantDelta: vi.fn() })).rejects.toThrow("empty response");
  });
});
