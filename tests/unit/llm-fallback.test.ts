import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** Every call goes straight to Anthropic — "fallback" is purely "try model id A, then B, then C"
 *  via `ai`'s own `generateObject`/`generateText`, so these tests mock at that boundary instead of
 *  `fetch`. This tests the retry/fallback LOGIC in `packages/ai/llm.ts` (which errors are
 *  retryable, that usage is tagged with the model that actually answered, that a real 4xx
 *  doesn't burn through the whole chain) without being coupled to the wire format. */
const { anthropicMock, generateObjectMock, generateTextMock, streamObjectMock } = vi.hoisted(() => ({
  anthropicMock: vi.fn((modelId: string) => ({ __modelId: modelId })),
  generateObjectMock: vi.fn(),
  generateTextMock: vi.fn(),
  streamObjectMock: vi.fn(),
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  generateObject: generateObjectMock,
  generateText: generateTextMock,
  streamObject: streamObjectMock,
}));

vi.mock("@ai-sdk/anthropic", () => ({ anthropic: anthropicMock }));

import { generateStructured, generateText, modelChain, streamStructured } from "../../packages/ai/llm";

/** A `streamObject` result stub: `object`/`usage` resolve (or reject) independently of whatever
 *  `partialObjectStream` yields — mirrors the real SDK shape closely enough for these tests. */
function streamObjectResult(object: unknown, partials: unknown[] = []) {
  return {
    object: object instanceof Error ? Promise.reject(object) : Promise.resolve(object),
    usage: Promise.resolve({ inputTokens: 2, outputTokens: 2 }),
    partialObjectStream: (async function* () { for (const p of partials) yield p; })(),
  };
}

afterEach(() => vi.clearAllMocks());

const schema = z.object({ intent: z.string() });

describe("generateStructured — model fallback", () => {
  it("tries each model id in order until one succeeds", async () => {
    generateObjectMock
      .mockRejectedValueOnce(Object.assign(new Error("down"), { status: 503 }))
      .mockResolvedValueOnce({ object: { intent: "food" }, usage: { inputTokens: 10, outputTokens: 5 } });
    const result = await generateStructured(["claude-a", "claude-b"], [{ role: "user", content: "x" }], schema);
    expect(result).toEqual({ intent: "food" });
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expect(anthropicMock).toHaveBeenNthCalledWith(1, "claude-a");
    expect(anthropicMock).toHaveBeenNthCalledWith(2, "claude-b");
  });

  it("reports usage tagged with the model that actually answered, not the first one tried", async () => {
    generateObjectMock
      .mockRejectedValueOnce(Object.assign(new Error("down"), { status: 500 }))
      .mockResolvedValueOnce({ object: { intent: "food" }, usage: { inputTokens: 3, outputTokens: 7 } });
    const onUsage = vi.fn();
    await generateStructured(["claude-a", "claude-b"], [{ role: "user", content: "x" }], schema, undefined, onUsage);
    expect(onUsage).toHaveBeenCalledWith({ model: "claude-b", promptTokens: 3, completionTokens: 7 });
  });

  it("does not fall over on a 400 (another model can't fix a bad request)", async () => {
    generateObjectMock.mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    await expect(generateStructured(["claude-a", "claude-b"], [], schema)).rejects.toThrow();
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("falls over on 401/403/429/5xx and on an error with no status at all", async () => {
    for (const status of [401, 403, 429, 500, 503, undefined]) {
      generateObjectMock.mockReset();
      generateObjectMock
        .mockRejectedValueOnce(status === undefined ? new Error("network") : Object.assign(new Error("x"), { status }))
        .mockResolvedValueOnce({ object: { intent: "ok" }, usage: { inputTokens: 1, outputTokens: 1 } });
      const result = await generateStructured(["claude-a", "claude-b"], [], schema);
      expect(result).toEqual({ intent: "ok" });
    }
  });

  it("throws the last error once every model in the chain has failed", async () => {
    generateObjectMock.mockRejectedValue(Object.assign(new Error("all down"), { status: 500 }));
    await expect(generateStructured(["claude-a", "claude-b"], [], schema)).rejects.toThrow("all down");
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("propagates the caller's own abort instead of trying the next model", async () => {
    const controller = new AbortController();
    controller.abort();
    generateObjectMock.mockRejectedValue(Object.assign(new DOMException("Aborted", "AbortError")));
    await expect(generateStructured(["claude-a", "claude-b"], [], schema, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });
});

describe("generateStructured — schemas Anthropic refuses", () => {
  const refusal = () => Object.assign(new Error("Schemas contains too many optional parameters (30)"), { statusCode: 400 });

  it("asks for plain JSON when the schema is refused, and remembers that for the next call", async () => {
    const complex = z.object({ intent: z.string(), note: z.string().optional() });
    generateObjectMock.mockRejectedValueOnce(refusal());
    generateTextMock.mockResolvedValue({ text: 'Sure:\n```json\n{"intent":"food"}\n```', usage: { inputTokens: 4, outputTokens: 2 } });
    const onUsage = vi.fn();
    const first = await generateStructured(["claude-a"], [{ role: "system", content: "plan" }, { role: "user", content: "x" }], complex, undefined, onUsage);
    expect(first).toEqual({ intent: "food" });
    const sent = generateTextMock.mock.calls[0][0].messages;
    expect(sent[0].content).toContain("plan");
    expect(sent[0].content).toContain("JSON Schema");
    expect(onUsage).toHaveBeenCalledWith({ model: "claude-a", promptTokens: 4, completionTokens: 2 });

    // the second call for the same schema goes straight to plain JSON
    const second = await generateStructured(["claude-a"], [{ role: "user", content: "y" }], complex);
    expect(second).toEqual({ intent: "food" });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it("falls over to the next model when the plain-JSON reply cannot be read", async () => {
    const other = z.object({ intent: z.string() });
    generateObjectMock.mockRejectedValueOnce(refusal());
    generateTextMock
      .mockResolvedValueOnce({ text: "I cannot do that", usage: { inputTokens: 1, outputTokens: 1 } })
      .mockResolvedValueOnce({ text: '{"intent":"stay"}', usage: { inputTokens: 1, outputTokens: 1 } });
    const result = await generateStructured(["claude-a", "claude-b"], [{ role: "user", content: "x" }], other);
    expect(result).toEqual({ intent: "stay" });
  });

  it("does not treat an unrelated 400 as a schema refusal", async () => {
    const third = z.object({ intent: z.string() });
    generateObjectMock.mockRejectedValueOnce(Object.assign(new Error("invalid x-api-key"), { statusCode: 400 }));
    await expect(generateStructured(["claude-a"], [], third)).rejects.toThrow("invalid x-api-key");
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});

describe("streamStructured — model fallback (Phase 2.6.1)", () => {
  it("resolves with the final object once streamObject's own `object` promise settles", async () => {
    streamObjectMock.mockReturnValueOnce(streamObjectResult({ intent: "food" }));
    const result = await streamStructured(["claude-a"], [], schema);
    expect(result).toEqual({ intent: "food" });
  });

  it("falls over to the next model when the first model's `object` promise rejects retryably", async () => {
    streamObjectMock
      .mockReturnValueOnce(streamObjectResult(Object.assign(new Error("down"), { status: 503 })))
      .mockReturnValueOnce(streamObjectResult({ intent: "food" }));
    const result = await streamStructured(["claude-a", "claude-b"], [], schema);
    expect(result).toEqual({ intent: "food" });
    expect(streamObjectMock).toHaveBeenCalledTimes(2);
  });

  it("does not fall over on a 400 — matches generateStructured's retry policy exactly", async () => {
    streamObjectMock.mockReturnValue(streamObjectResult(Object.assign(new Error("bad"), { status: 400 })));
    await expect(streamStructured(["claude-a", "claude-b"], [], schema)).rejects.toThrow();
    expect(streamObjectMock).toHaveBeenCalledTimes(1);
  });

  it("calls onPartial with every partial object streamed before the final object resolves", async () => {
    streamObjectMock.mockReturnValueOnce(streamObjectResult({ intent: "food" }, [{ intent: "fo" }, { intent: "food" }]));
    const partials: unknown[] = [];
    const result = await streamStructured(["claude-a"], [], schema, undefined, undefined, { onPartial: (p) => partials.push(p) });
    expect(result).toEqual({ intent: "food" });
    expect(partials).toEqual([{ intent: "fo" }, { intent: "food" }]);
  });

  it("a throwing onPartial does not fail the call — the final `object` await is still the real signal", async () => {
    streamObjectMock.mockReturnValueOnce(streamObjectResult({ intent: "food" }, [{ intent: "fo" }]));
    const result = await streamStructured(["claude-a"], [], schema, undefined, undefined, {
      onPartial: () => { throw new Error("progress UI blew up"); },
    });
    expect(result).toEqual({ intent: "food" });
  });

  it("reports usage tagged with the model that actually answered", async () => {
    streamObjectMock
      .mockReturnValueOnce(streamObjectResult(Object.assign(new Error("down"), { status: 500 })))
      .mockReturnValueOnce(streamObjectResult({ intent: "food" }));
    const onUsage = vi.fn();
    await streamStructured(["claude-a", "claude-b"], [], schema, undefined, onUsage);
    expect(onUsage).toHaveBeenCalledWith({ model: "claude-b", promptTokens: 2, completionTokens: 2 });
  });
});

describe("generateText — model fallback", () => {
  it("falls over on a provider error and returns the next model's text", async () => {
    generateTextMock
      .mockRejectedValueOnce(Object.assign(new Error("down"), { status: 503 }))
      .mockResolvedValueOnce({ text: "from model2", usage: { inputTokens: 4, outputTokens: 6 } });
    const text = await generateText(["claude-a", "claude-b"], [{ role: "user", content: "hi" }]);
    expect(text).toBe("from model2");
  });

  it("treats an empty response as a failure worth falling over for", async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: "", usage: { inputTokens: 1, outputTokens: 0 } })
      .mockResolvedValueOnce({ text: "real answer", usage: { inputTokens: 1, outputTokens: 3 } });
    const text = await generateText(["claude-a", "claude-b"], [{ role: "user", content: "hi" }]);
    expect(text).toBe("real answer");
  });
});

describe("modelChain", () => {
  it("resolves each model id to an Anthropic model, preserving order", () => {
    const chain = modelChain(["claude-a", "claude-b"]);
    expect(chain).toEqual([
      { model: { __modelId: "claude-a" }, modelId: "claude-a" },
      { model: { __modelId: "claude-b" }, modelId: "claude-b" },
    ]);
  });

  it("accepts the old \"anthropic/\" spelling and traces the bare id", () => {
    expect(modelChain(["anthropic/claude-sonnet-5"])).toEqual([{ model: { __modelId: "claude-sonnet-5" }, modelId: "claude-sonnet-5" }]);
  });
});

describe("prompt caching (opts.caching) marks the system prompt", () => {
  const messages = [{ role: "system" as const, content: "big shared prompt" }, { role: "user" as const, content: "hi" }];

  it("generateStructured marks the system message cacheable when opts.caching is set", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { intent: "food" }, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateStructured(["claude-a"], messages, schema, undefined, undefined, { caching: "auto" });
    const sent = generateObjectMock.mock.calls[0][0].messages;
    expect(sent[0].providerOptions).toEqual({ anthropic: { cacheControl: { type: "ephemeral" } } });
    expect(sent[1].providerOptions).toBeUndefined();
  });

  it("streamStructured marks it too", async () => {
    streamObjectMock.mockReturnValueOnce(streamObjectResult({ intent: "food" }));
    await streamStructured(["claude-a"], messages, schema, undefined, undefined, { caching: "auto" });
    expect(streamObjectMock.mock.calls[0][0].messages[0].providerOptions).toEqual({ anthropic: { cacheControl: { type: "ephemeral" } } });
  });

  it("leaves the messages untouched when opts.caching is unset", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { intent: "food" }, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateStructured(["claude-a"], messages, schema);
    expect(generateObjectMock.mock.calls[0][0].messages).toEqual(messages);
  });
});
