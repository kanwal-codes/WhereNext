import { beforeEach, describe, expect, it, vi } from "vitest";

type Any = Record<string, any>;
const generateText = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText: (...a: unknown[]) => generateText(...a) }));
const withDeadline = vi.hoisted(() => vi.fn((signal: AbortSignal, _ms: number) => signal));
vi.mock("@/packages/ai/model-policy", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/packages/ai/model-policy")>()), withDeadline: (...a: [AbortSignal, number]) => withDeadline(...a) }));
vi.mock("@/lib/server/logger", () => ({ logger: { warn, error: vi.fn(), info: vi.fn() } }));

import { composeBuffered } from "../../lib/server/compose-buffered";
import { AI_DEADLINE_MS } from "../../packages/ai/model-policy";

const entry = (id: string, extra: Any = {}) => ({ model: { id }, modelId: id, ...extra }) as never;
const run = (chain: never[], over: Any = {}) => {
  const ac = new AbortController();
  const promise = composeBuffered({ chain, system: "SYS", messages: [{ role: "user", content: "hi" }], tools: {}, signal: ac.signal, ...over });
  return { promise, ac };
};

beforeEach(() => { generateText.mockReset(); warn.mockClear(); withDeadline.mockClear(); });

describe("composeBuffered", () => {
  it("returns the text, the model that wrote it and its usage", async () => {
    generateText.mockResolvedValueOnce({ text: "Take the 8am train.", usage: { inputTokens: 100, outputTokens: 12 } });
    const { promise } = run([entry("primary")]);
    expect(await promise).toEqual({ text: "Take the 8am train.", modelId: "primary", usage: { inputTokens: 100, outputTokens: 12 } });
  });

  it("passes the prompt, tools, step limit and provider options through", async () => {
    generateText.mockResolvedValueOnce({ text: "x", usage: undefined });
    const tools = { lookup: {} } as never;
    const { promise } = run([entry("p", { providerOptions: { anthropic: { effort: "low" } } })], { tools, system: "S" });
    await promise;
    const call = generateText.mock.calls[0][0] as Any;
    expect(call).toMatchObject({ model: { id: "p" }, system: "S", messages: [{ role: "user", content: "hi" }], providerOptions: { anthropic: { effort: "low" } } });
    expect(call.tools).toBe(tools);
    expect(call.stopWhen).toBeTypeOf("function");
  });

  it("leaves provider options out when the entry has none", async () => {
    generateText.mockResolvedValueOnce({ text: "x", usage: undefined });
    await run([entry("p")]).promise;
    expect("providerOptions" in (generateText.mock.calls[0][0] as Any)).toBe(false);
  });

  it("moves to the next model when one fails, and logs the failed attempt", async () => {
    generateText.mockRejectedValueOnce(new Error("overloaded")).mockResolvedValueOnce({ text: "from fallback", usage: undefined });
    const result = await run([entry("primary"), entry("fallback")]).promise;
    expect(result).toMatchObject({ text: "from fallback", modelId: "fallback" });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ attempt: 0 }), "group-chat compose model failed, trying next in chain");
  });

  it("throws the last error when every model fails", async () => {
    generateText.mockRejectedValueOnce(new Error("first")).mockRejectedValueOnce(new Error("second"));
    await expect(run([entry("a"), entry("b")]).promise).rejects.toThrow("second");
  });

  it("throws when there is no model", async () => {
    await expect(run([]).promise).rejects.toThrow("compose produced no model");
  });

  it("stops at a hang-up instead of trying the next model", async () => {
    const hangup = Object.assign(new Error("ResponseAborted"), { name: "ResponseAborted" });
    generateText.mockRejectedValueOnce(hangup);
    await expect(run([entry("a"), entry("b")]).promise).rejects.toBe(hangup);
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("stops at an abort error too", async () => {
    generateText.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
    await expect(run([entry("a"), entry("b")]).promise).rejects.toMatchObject({ name: "AbortError" });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("stops when the caller has gone, whatever the error says", async () => {
    const ac = new AbortController();
    generateText.mockImplementationOnce(async () => { ac.abort(); throw new Error("socket closed"); });
    await expect(composeBuffered({ chain: [entry("a"), entry("b")], system: "S", messages: [], tools: {}, signal: ac.signal })).rejects.toThrow("socket closed");
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("gives an earlier model a shorter deadline than the last", async () => {
    generateText.mockRejectedValueOnce(new Error("slow")).mockResolvedValueOnce({ text: "x", usage: undefined });
    await run([entry("a"), entry("b")]).promise;
    expect(withDeadline.mock.calls.map((c) => c[1])).toEqual([AI_DEADLINE_MS.composeBufferedFallback, AI_DEADLINE_MS.composeBuffered]);
  });

  it("gives a lone model the full deadline", async () => {
    generateText.mockResolvedValueOnce({ text: "x", usage: undefined });
    await run([entry("only")]).promise;
    expect(withDeadline.mock.calls.map((c) => c[1])).toEqual([AI_DEADLINE_MS.composeBuffered]);
  });
});
