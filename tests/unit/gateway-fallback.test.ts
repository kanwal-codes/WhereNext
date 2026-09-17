import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** Every provider now goes through the SAME client (Vercel AI Gateway) — "fallback" is purely
 *  "try model id A, then B, then C" via `ai`'s own `generateObject`/`generateText`, so these
 *  tests mock at that boundary instead of `fetch`. This tests the retry/fallback LOGIC in
 *  `packages/ai/gateway.ts` (which errors are retryable, that usage is tagged with the model
 *  that actually answered, that a real 4xx doesn't burn through the whole chain) without being
 *  coupled to the Gateway's wire format. */
const { gatewayMock, generateObjectMock, generateTextMock, streamObjectMock } = vi.hoisted(() => ({
  gatewayMock: vi.fn((modelId: string) => ({ __modelId: modelId })),
  generateObjectMock: vi.fn(),
  generateTextMock: vi.fn(),
  streamObjectMock: vi.fn(),
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  gateway: gatewayMock,
  generateObject: generateObjectMock,
  generateText: generateTextMock,
  streamObject: streamObjectMock,
}));

import { generateStructured, generateText, gatewayModelChain, streamStructured } from "../../packages/ai/gateway";

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

describe("generateStructured — Gateway model fallback", () => {
  it("tries each model id in order until one succeeds", async () => {
    generateObjectMock
      .mockRejectedValueOnce(Object.assign(new Error("down"), { status: 503 }))
      .mockResolvedValueOnce({ object: { intent: "food" }, usage: { inputTokens: 10, outputTokens: 5 } });
    const result = await generateStructured(["a/model1", "b/model2"], [{ role: "user", content: "x" }], schema);
    expect(result).toEqual({ intent: "food" });
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expect(gatewayMock).toHaveBeenNthCalledWith(1, "a/model1");
    expect(gatewayMock).toHaveBeenNthCalledWith(2, "b/model2");
  });

  it("reports usage tagged with the model that actually answered, not the first one tried", async () => {
    generateObjectMock
      .mockRejectedValueOnce(Object.assign(new Error("down"), { status: 500 }))
      .mockResolvedValueOnce({ object: { intent: "food" }, usage: { inputTokens: 3, outputTokens: 7 } });
    const onUsage = vi.fn();
    await generateStructured(["a/model1", "b/model2"], [{ role: "user", content: "x" }], schema, undefined, onUsage);
    expect(onUsage).toHaveBeenCalledWith({ model: "b/model2", promptTokens: 3, completionTokens: 7 });
  });

  it("does not fall over on a 400 (another model can't fix a bad request)", async () => {
    generateObjectMock.mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    await expect(generateStructured(["a/model1", "b/model2"], [], schema)).rejects.toThrow();
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("falls over on 401/403/429/5xx and on an error with no status at all", async () => {
    for (const status of [401, 403, 429, 500, 503, undefined]) {
      generateObjectMock.mockReset();
      generateObjectMock
        .mockRejectedValueOnce(status === undefined ? new Error("network") : Object.assign(new Error("x"), { status }))
        .mockResolvedValueOnce({ object: { intent: "ok" }, usage: { inputTokens: 1, outputTokens: 1 } });
      const result = await generateStructured(["a/model1", "b/model2"], [], schema);
      expect(result).toEqual({ intent: "ok" });
    }
  });

  it("throws the last error once every model in the chain has failed", async () => {
    generateObjectMock.mockRejectedValue(Object.assign(new Error("all down"), { status: 500 }));
    await expect(generateStructured(["a/model1", "b/model2"], [], schema)).rejects.toThrow("all down");
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("propagates the caller's own abort instead of trying the next model", async () => {
    const controller = new AbortController();
    controller.abort();
    generateObjectMock.mockRejectedValue(Object.assign(new DOMException("Aborted", "AbortError")));
    await expect(generateStructured(["a/model1", "b/model2"], [], schema, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });
});

describe("streamStructured — Gateway model fallback (Phase 2.6.1)", () => {
  it("resolves with the final object once streamObject's own `object` promise settles", async () => {
    streamObjectMock.mockReturnValueOnce(streamObjectResult({ intent: "food" }));
    const result = await streamStructured(["a/model1"], [], schema);
    expect(result).toEqual({ intent: "food" });
  });

  it("falls over to the next model when the first model's `object` promise rejects retryably", async () => {
    streamObjectMock
      .mockReturnValueOnce(streamObjectResult(Object.assign(new Error("down"), { status: 503 })))
      .mockReturnValueOnce(streamObjectResult({ intent: "food" }));
    const result = await streamStructured(["a/model1", "b/model2"], [], schema);
    expect(result).toEqual({ intent: "food" });
    expect(streamObjectMock).toHaveBeenCalledTimes(2);
  });

  it("does not fall over on a 400 — matches generateStructured's retry policy exactly", async () => {
    streamObjectMock.mockReturnValue(streamObjectResult(Object.assign(new Error("bad"), { status: 400 })));
    await expect(streamStructured(["a/model1", "b/model2"], [], schema)).rejects.toThrow();
    expect(streamObjectMock).toHaveBeenCalledTimes(1);
  });

  it("calls onPartial with every partial object streamed before the final object resolves", async () => {
    streamObjectMock.mockReturnValueOnce(streamObjectResult({ intent: "food" }, [{ intent: "fo" }, { intent: "food" }]));
    const partials: unknown[] = [];
    const result = await streamStructured(["a/model1"], [], schema, undefined, undefined, { onPartial: (p) => partials.push(p) });
    expect(result).toEqual({ intent: "food" });
    expect(partials).toEqual([{ intent: "fo" }, { intent: "food" }]);
  });

  it("a throwing onPartial does not fail the call — the final `object` await is still the real signal", async () => {
    streamObjectMock.mockReturnValueOnce(streamObjectResult({ intent: "food" }, [{ intent: "fo" }]));
    const result = await streamStructured(["a/model1"], [], schema, undefined, undefined, {
      onPartial: () => { throw new Error("progress UI blew up"); },
    });
    expect(result).toEqual({ intent: "food" });
  });

  it("passes caching:'auto' to streamObject when opts.caching is set", async () => {
    streamObjectMock.mockReturnValueOnce(streamObjectResult({ intent: "food" }));
    await streamStructured(["google/gemini-3.8-flash"], [], schema, undefined, undefined, { caching: "auto" });
    expect(streamObjectMock).toHaveBeenCalledWith(expect.objectContaining({ providerOptions: { gateway: { caching: "auto" } } }));
  });

  it("reports usage tagged with the model that actually answered", async () => {
    streamObjectMock
      .mockReturnValueOnce(streamObjectResult(Object.assign(new Error("down"), { status: 500 })))
      .mockReturnValueOnce(streamObjectResult({ intent: "food" }));
    const onUsage = vi.fn();
    await streamStructured(["a/model1", "b/model2"], [], schema, undefined, onUsage);
    expect(onUsage).toHaveBeenCalledWith({ model: "b/model2", promptTokens: 2, completionTokens: 2 });
  });
});

describe("generateText — Gateway model fallback", () => {
  it("falls over on a provider error and returns the next model's text", async () => {
    generateTextMock
      .mockRejectedValueOnce(Object.assign(new Error("down"), { status: 503 }))
      .mockResolvedValueOnce({ text: "from model2", usage: { inputTokens: 4, outputTokens: 6 } });
    const text = await generateText(["a/model1", "b/model2"], [{ role: "user", content: "hi" }]);
    expect(text).toBe("from model2");
  });

  it("treats an empty response as a failure worth falling over for", async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: "", usage: { inputTokens: 1, outputTokens: 0 } })
      .mockResolvedValueOnce({ text: "real answer", usage: { inputTokens: 1, outputTokens: 3 } });
    const text = await generateText(["a/model1", "b/model2"], [{ role: "user", content: "hi" }]);
    expect(text).toBe("real answer");
  });
});

describe("gatewayModelChain", () => {
  it("resolves each model id through the Gateway, preserving order", () => {
    const chain = gatewayModelChain(["a/model1", "b/model2"]);
    expect(chain).toEqual([
      { model: { __modelId: "a/model1" }, modelId: "a/model1" },
      { model: { __modelId: "b/model2" }, modelId: "b/model2" },
    ]);
  });

  // Phase 2.1.2 (docs/overhaul/roadmap/phase-2-speed.md) — checking the plumbing, not real
  // Cerebras behavior: a chain entry that pins a provider must actually carry that pin through
  // to the resolved chain, distinct from an unpinned fallback entry right next to it.
  it("carries a pinned entry's providerOptions, leaves an unpinned entry's undefined", () => {
    const chain = gatewayModelChain([{ id: "openai/gpt-oss-120b", only: ["cerebras"] }, "google/gemini-3.8-flash"]);
    expect(chain[0]).toMatchObject({ modelId: "openai/gpt-oss-120b", providerOptions: { gateway: { only: ["cerebras"] } } });
    expect(chain[1]).toMatchObject({ modelId: "google/gemini-3.8-flash", providerOptions: undefined });
  });
});

describe("provider pinning reaches the underlying Gateway call", () => {
  it("generateStructured passes a pinned entry's providerOptions to generateObject", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { intent: "food" }, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateStructured([{ id: "openai/gpt-oss-120b", only: ["cerebras"] }], [], schema);
    expect(generateObjectMock).toHaveBeenCalledWith(expect.objectContaining({ providerOptions: { gateway: { only: ["cerebras"] } } }));
  });

  it("generateStructured passes no providerOptions for a bare, unpinned entry", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { intent: "food" }, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateStructured(["google/gemini-3.8-flash"], [], schema);
    expect(generateObjectMock).toHaveBeenCalledWith(expect.not.objectContaining({ providerOptions: expect.anything() }));
  });

  it("generateText passes a pinned entry's providerOptions to the SDK's generateText", async () => {
    generateTextMock.mockResolvedValueOnce({ text: "hi", usage: { inputTokens: 1, outputTokens: 1 } });
    await generateText([{ id: "openai/gpt-oss-120b", only: ["cerebras"] }], []);
    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({ providerOptions: { gateway: { only: ["cerebras"] } } }));
  });
});

describe("prompt caching (Phase 2.4, opts.caching) reaches the underlying Gateway call", () => {
  it("generateStructured passes caching:'auto' for a bare, unpinned entry when opts.caching is set", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { intent: "food" }, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateStructured(["google/gemini-3.8-flash"], [], schema, undefined, undefined, { caching: "auto" });
    expect(generateObjectMock).toHaveBeenCalledWith(expect.objectContaining({ providerOptions: { gateway: { caching: "auto" } } }));
  });

  it("merges caching:'auto' alongside a pinned entry's `only`, without losing the pin", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { intent: "food" }, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateStructured([{ id: "openai/gpt-oss-120b", only: ["cerebras"] }], [], schema, undefined, undefined, { caching: "auto" });
    expect(generateObjectMock).toHaveBeenCalledWith(expect.objectContaining({ providerOptions: { gateway: { only: ["cerebras"], caching: "auto" } } }));
  });

  it("does not add a providerOptions key at all when opts.caching is unset and the entry is unpinned", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { intent: "food" }, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateStructured(["google/gemini-3.8-flash"], [], schema);
    expect(generateObjectMock).toHaveBeenCalledWith(expect.not.objectContaining({ providerOptions: expect.anything() }));
  });
});
