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
    const meta = await sendConversationMessage({ tripId: "trip", content: "Find museums", onSurfaceSelect, onUserSaved, onAssistantStart, onAssistantDelta: (content) => deltas.push(content) });

    expect(calls.filter((call) => call.startsWith("POST ")).map((call) => call.split(" ")[1])).toEqual(["/api/trips/trip/conversation", "/api/ai"]);
    expect(onUserSaved).toHaveBeenCalledOnce();
    expect(onAssistantStart).toHaveBeenCalledOnce();
    expect(onSurfaceSelect).toHaveBeenCalledWith("explore");
    expect(deltas).toEqual(["hello"]);
    expect(meta?.surface).toBe("explore");
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
