import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantRequestError, streamAssistantResponse } from "../../features/conversation/application/streamAssistantResponse";

afterEach(() => vi.restoreAllMocks());

describe("assistant stream transport", () => {
  it("parses content deltas and reports cumulative content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n' +
      "data: [DONE]\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )));
    const updates: string[] = [];
    await expect(streamAssistantResponse("trip", [{ role: "user", content: "Hi" }], (content) => updates.push(content), undefined, "message-key")).resolves.toMatchObject({ content: "Hello world" });
    expect(updates).toEqual(["Hello", "Hello world"]);
  });

  it("captures the trailing metadata frame", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n' +
      'data: {"meta":{"surface":"stay","blocks":[{"type":"actions","items":[{"label":"Hostels","prompt":"Show hostels"}]}],"suggestedFollowups":[]}}\n\n' +
      "data: [DONE]\n\n",
      { status: 200 },
    )));
    const result = await streamAssistantResponse("trip", [{ role: "user", content: "Hi" }], () => undefined, undefined, "message-key");
    expect(result.content).toBe("ok");
    expect(result.meta?.surface).toBe("stay");
    expect(result.meta?.blocks?.[0]).toMatchObject({ type: "actions" });
  });

  it("flushes a final event without a trailing newline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"content":"last"}}]}',
      { status: 200 },
    )));
    await expect(streamAssistantResponse("trip", [{ role: "user", content: "Hi" }], () => undefined, undefined, "message-key")).resolves.toMatchObject({ content: "last" });
  });

  it("preserves a server rate-limit response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Try again shortly" }), { status: 429 })));
    await expect(streamAssistantResponse("trip", [{ role: "user", content: "Hi" }], () => undefined, undefined, "message-key")).rejects.toEqual(new AssistantRequestError(429, "Try again shortly"));
  });

  it("accepts an SSE response without proxy buffering", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { "content-type": "text/event-stream", "x-accel-buffering": "no" } },
    )));
    await expect(streamAssistantResponse("trip", [{ role: "user", content: "Hi" }], () => undefined, undefined, "message-key")).resolves.toMatchObject({ content: "ok" });
  });
});
