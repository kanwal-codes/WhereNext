import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { APICallError, tool } from "ai";
import { z } from "zod";

vi.mock("@/lib/server/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { openComposeStream } from "../../lib/server/compose-stream";

// The real streamText, not a mock: it reports a provider failure as an "error" part instead of throwing, which a mocked
// streamText hid. These pin that a failed model falls over to the next one, and a reply cut off part-way is flagged.

const overloaded = () => new APICallError({ message: "Overloaded", url: "https://api.anthropic.com", requestBodyValues: {}, statusCode: 529, isRetryable: true });
const usage = { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 2, text: 2, reasoning: 0 } };
const replying = (texts: string[], failAfter?: Error) =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(c) {
          c.enqueue({ type: "stream-start", warnings: [] });
          c.enqueue({ type: "text-start", id: "t" });
          for (const delta of texts) c.enqueue({ type: "text-delta", id: "t", delta });
          if (failAfter) { c.enqueue({ type: "error", error: failAfter }); c.close(); return; }
          c.enqueue({ type: "text-end", id: "t" });
          c.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage });
          c.close();
        },
      }),
    }),
  });
const failing = () => {
  const model = new MockLanguageModelV4({ doStream: async () => { throw overloaded(); } });
  return model;
};

const entry = (id: string, model: MockLanguageModelV4) => ({ model, modelId: id }) as never;
const read = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  let out = "";
  for (;;) { const r = await reader.read(); if (r.done) return out; out += new TextDecoder().decode(r.value); }
};
const open = (chain: never[], onModel = vi.fn()) =>
  openComposeStream({ chain, system: "SYS", messages: [{ role: "user", content: "hi" }], tools: {}, signal: new AbortController().signal, onModel, onUsage: vi.fn() });

describe("openComposeStream with the real AI SDK", () => {
  it("falls over to the next model at once when the lead is overloaded", async () => {
    const lead = failing();
    const onModel = vi.fn();
    const started = Date.now();
    const body = await read(await open([entry("lead", lead), entry("backup", replying(["Hello"]))], onModel));
    expect(onModel).toHaveBeenCalledWith("backup");
    expect(body).toContain("Hello");
    expect(lead.doStreamCalls).toHaveLength(1); // no SDK retry on a model that has a fallback
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("throws when every model fails instead of returning an empty reply", async () => {
    await expect(open([entry("only", new MockLanguageModelV4({ doStream: async () => { throw new APICallError({ message: "bad", url: "x", requestBodyValues: {}, statusCode: 400, isRetryable: false }); } }))])).rejects.toThrow("bad");
  });

  it("flags a reply that fails part-way as truncated", async () => {
    const body = await read(await open([entry("lead", replying(["Half a"], overloaded()))]));
    expect(body).toContain("Half a");
    expect(body).toContain('"truncated":true');
  });
});

describe("a tool that throws is not a model failure", () => {
  it("keeps the same model and lets it answer after the tool error", async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        call += 1;
        const parts = call === 1
          ? [{ type: "stream-start", warnings: [] }, { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: "{}" }, { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_use" }, usage }]
          : [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Answered anyway" }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }];
        return { stream: new ReadableStream({ start(c) { for (const p of parts) c.enqueue(p); c.close(); } }) } as never;
      },
    });
    const tools = { lookup: tool({ description: "x", inputSchema: z.object({}), execute: async (): Promise<string> => { throw new Error("provider down"); } }) };
    const onModel = vi.fn();
    const stream = await openComposeStream({ chain: [entry("lead", model), entry("backup", replying(["wrong"]))], system: "S", messages: [{ role: "user", content: "hi" }], tools, signal: new AbortController().signal, onModel, onUsage: vi.fn() });
    const body = await read(stream);
    expect(onModel).toHaveBeenCalledWith("lead");
    expect(body).toContain("Answered anyway");
    expect(body).not.toContain('"truncated":true');
  });
});
