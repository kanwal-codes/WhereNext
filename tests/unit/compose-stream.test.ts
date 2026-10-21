import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Any = Record<string, any>;
const streamText = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());
const error = vi.hoisted(() => vi.fn());
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), streamText: (...a: unknown[]) => streamText(...a) }));
vi.mock("@/lib/server/logger", () => ({ logger: { warn, error, info: vi.fn() } }));

import { openComposeStream } from "../../lib/server/compose-stream";
import { AI_DEADLINE_MS } from "../../packages/ai/model-policy";

/** A fake `streamText` result: yields `chunks` after `firstDelayMs`, or throws `fail` instead. */
function fake(spec: { chunks?: string[]; fail?: Error; hangFirst?: boolean; midFail?: Error; usage?: { inputTokens?: number; outputTokens?: number } }) {
  const abort = { signal: undefined as AbortSignal | undefined };
  const result = {
    textStream: (async function* () {
      if (spec.fail) throw spec.fail;
      if (spec.hangFirst) await new Promise(() => {});
      let i = 0;
      for (const c of spec.chunks ?? []) {
        yield c;
        i += 1;
        if (spec.midFail && i === 1) throw spec.midFail;
      }
    })(),
    totalUsage: Promise.resolve(spec.usage ?? { inputTokens: 7, outputTokens: 3 }),
  };
  return { result, abort };
}
const frames = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const out: string[] = [];
  for (;;) { const r = await reader.read(); if (r.done) break; out.push(decoder.decode(r.value)); }
  return out;
};
const deltas = (fr: string[]) => fr.filter((f) => f.includes("delta")).map((f) => JSON.parse(f.replace(/^data: /, "").trim()).choices[0].delta.content);
const entry = (id: string, extra: Any = {}) => ({ model: { id }, modelId: id, ...extra }) as never;
const run = (chain: never[], over: Any = {}) => {
  const onModel = vi.fn();
  const onUsage = vi.fn();
  const ac = new AbortController();
  const promise = openComposeStream({ chain, system: "SYS", messages: [{ role: "user", content: "hi" }], tools: {}, signal: ac.signal, onModel, onUsage, ...over });
  return { promise, onModel, onUsage, ac };
};

beforeEach(() => { streamText.mockReset(); warn.mockClear(); error.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe("openComposeStream: the model that answers", () => {
  it("streams the primary model's text as SSE frames and says which model it was", async () => {
    streamText.mockReturnValueOnce(fake({ chunks: ["Hello ", "there"] }).result);
    const { promise, onModel } = run([entry("primary")]);
    const fr = await frames(await promise);
    expect(deltas(fr)).toEqual(["Hello ", "there"]);
    expect(onModel).toHaveBeenCalledWith("primary");
  });

  it("passes the prompt, tools, step limit and provider options through", async () => {
    streamText.mockReturnValueOnce(fake({ chunks: ["a"] }).result);
    const tools = { lookup: {} } as never;
    const { promise } = run([entry("p", { providerOptions: { anthropic: { thinking: false } } })], { tools, system: "S" });
    await frames(await promise);
    const call = streamText.mock.calls[0][0] as Any;
    expect(call.model).toEqual({ id: "p" });
    expect(call.system).toBe("S");
    expect(call.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(call.tools).toBe(tools);
    expect(call.providerOptions).toEqual({ anthropic: { thinking: false } });
    expect(call.stopWhen).toBeTypeOf("function");
  });

  it("leaves provider options out when the entry has none", async () => {
    streamText.mockReturnValueOnce(fake({ chunks: ["a"] }).result);
    const { promise } = run([entry("p")]);
    await frames(await promise);
    expect("providerOptions" in (streamText.mock.calls[0][0] as Any)).toBe(false);
  });

  it("logs a real stream error but not an ordinary disconnect", async () => {
    streamText.mockReturnValueOnce(fake({ chunks: ["a"] }).result);
    const { promise } = run([entry("p")]);
    await frames(await promise);
    const onError = (streamText.mock.calls[0][0] as Any).onError as (e: { error: unknown }) => void;
    onError({ error: new DOMException("Aborted", "AbortError") });
    expect(error).not.toHaveBeenCalled();
    onError({ error: new Error("provider 500") });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), "compose stream error");
  });

  it("moves to the next model when the first fails before its first chunk", async () => {
    streamText.mockReturnValueOnce(fake({ fail: new Error("rate limited") }).result).mockReturnValueOnce(fake({ chunks: ["fallback answer"] }).result);
    const { promise, onModel } = run([entry("primary"), entry("fallback")]);
    const fr = await frames(await promise);
    expect(deltas(fr)).toEqual(["fallback answer"]);
    expect(onModel).toHaveBeenCalledTimes(1);
    expect(onModel).toHaveBeenCalledWith("fallback");
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ attempt: 0 }), "compose model failed, trying next in chain");
  });

  it("aborts the failed attempt so it stops spending", async () => {
    streamText.mockReturnValueOnce(fake({ fail: new Error("boom") }).result).mockReturnValueOnce(fake({ chunks: ["ok"] }).result);
    const { promise } = run([entry("a"), entry("b")]);
    await promise;
    const first = (streamText.mock.calls[0][0] as Any).abortSignal as AbortSignal;
    const second = (streamText.mock.calls[1][0] as Any).abortSignal as AbortSignal;
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it("fails with the last error when every model fails", async () => {
    streamText.mockReturnValueOnce(fake({ fail: new Error("first") }).result).mockReturnValueOnce(fake({ fail: new Error("second") }).result);
    const { promise } = run([entry("a"), entry("b")]);
    await expect(promise).rejects.toThrow("second");
  });

  it("fails when there is no model at all", async () => {
    const { promise } = run([]);
    await expect(promise).rejects.toThrow("compose produced no model");
  });

  it("stops at an abort rather than trying the next model", async () => {
    streamText.mockReturnValueOnce(fake({ fail: new DOMException("Aborted", "AbortError") }).result);
    const { promise } = run([entry("a"), entry("b")]);
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(streamText).toHaveBeenCalledTimes(1);
  });
});

describe("openComposeStream: a stalled model", () => {
  it("gives up on an earlier model after the short wait and moves on", async () => {
    vi.useFakeTimers();
    streamText.mockReturnValueOnce(fake({ hangFirst: true }).result).mockReturnValueOnce(fake({ chunks: ["rescued"] }).result);
    const { promise, onModel } = run([entry("slow"), entry("fast")]);
    let settled = false;
    void promise.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(AI_DEADLINE_MS.composeTtftFallback - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const fr = await frames(await promise);
    expect(deltas(fr)).toEqual(["rescued"]);
    expect(onModel).toHaveBeenCalledWith("fast");
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.objectContaining({ message: "compose time-to-first-token exceeded" }) }), expect.any(String));
  });

  it("gives the last model the full wait", async () => {
    vi.useFakeTimers();
    streamText.mockReturnValueOnce(fake({ hangFirst: true }).result);
    const { promise } = run([entry("only")]);
    const caught = promise.then(() => new Error("resolved"), (e: Error) => e);
    await vi.advanceTimersByTimeAsync(AI_DEADLINE_MS.composeTtftFallback + 100);
    let done = false;
    void caught.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(AI_DEADLINE_MS.composeTtft - AI_DEADLINE_MS.composeTtftFallback);
    expect((await caught).message).toBe("compose time-to-first-token exceeded");
  });
});

describe("openComposeStream: usage", () => {
  it("reports the token counts once the model finishes", async () => {
    streamText.mockReturnValueOnce(fake({ chunks: ["x"], usage: { inputTokens: 120, outputTokens: 45 } }).result);
    const { promise, onUsage } = run([entry("p")]);
    await frames(await promise);
    await Promise.resolve();
    expect(onUsage).toHaveBeenCalledWith(120, 45);
  });

  it("counts a missing figure as zero", async () => {
    streamText.mockReturnValueOnce(fake({ chunks: ["x"], usage: {} }).result);
    const { promise, onUsage } = run([entry("p")]);
    await frames(await promise);
    await Promise.resolve();
    expect(onUsage).toHaveBeenCalledWith(0, 0);
  });

  it("does not mind a usage promise that rejects", async () => {
    const r = fake({ chunks: ["x"] }).result;
    (r as Any).totalUsage = Promise.reject(new Error("no usage"));
    streamText.mockReturnValueOnce(r);
    const { promise, onUsage } = run([entry("p")]);
    await frames(await promise);
    expect(onUsage).not.toHaveBeenCalled();
  });
});

describe("openComposeStream: the text", () => {
  it("holds back a reasoning model's scratchpad", async () => {
    streamText.mockReturnValueOnce(fake({ chunks: ["<think>planning the route</think>", "Take the train."] }).result);
    const { promise } = run([entry("p")]);
    const out = deltas(await frames(await promise)).join("");
    expect(out).toBe("Take the train.");
  });

  it("skips empty chunks", async () => {
    streamText.mockReturnValueOnce(fake({ chunks: ["", "hi", ""] }).result);
    const { promise } = run([entry("p")]);
    expect(deltas(await frames(await promise))).toEqual(["hi"]);
  });

  it("ends with a truncated frame when the model fails part-way, and logs it", async () => {
    streamText.mockReturnValueOnce(fake({ chunks: ["Part one", " part two"], midFail: new Error("connection reset") }).result);
    const { promise } = run([entry("p")]);
    const fr = await frames(await promise);
    expect(deltas(fr)).toEqual(["Part one"]);
    expect(fr.at(-1)).toContain("truncated");
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), "compose stream ended early");
  });

  it("flags a disconnect part-way as truncated without logging an error", async () => {
    streamText.mockReturnValueOnce(fake({ chunks: ["Part one", "x"], midFail: new DOMException("Aborted", "AbortError") }).result);
    const { promise } = run([entry("p")]);
    const fr = await frames(await promise);
    expect(fr.at(-1)).toContain("truncated");
    expect(error).not.toHaveBeenCalled();
  });
});
