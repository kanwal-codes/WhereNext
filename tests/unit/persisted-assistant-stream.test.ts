import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appendMock = vi.fn();
vi.mock("@/features/conversation/infrastructure/conversationRepository", () => ({
  createConversationRepository: () => ({ append: appendMock }),
}));

import { persistedAssistantStream } from "@/features/conversation/application/persistedAssistantStream";

const TRIP = "trip-1";
const USER = "user-1";
const KEY = "assistant:idem-1";

/** An OpenAI-style SSE byte stream from a list of already-formatted lines. */
function upstream(...lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(enc.encode(line));
      controller.close();
    },
  });
}
const delta = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

beforeEach(() => {
  vi.clearAllMocks();
  appendMock.mockResolvedValue({ id: "a1" });
});
afterEach(() => vi.resetModules());

describe("persistedAssistantStream", () => {
  it("tees the provider frames through unchanged and persists the accumulated text", async () => {
    const out = await drain(persistedAssistantStream(upstream(delta("Hello "), delta("world."), "data: [DONE]\n\n"), {} as never, TRIP, USER, KEY));
    expect(out).toContain(delta("Hello "));
    expect(out).toContain(delta("world."));
    expect(out).toContain("data: [DONE]");
    expect(appendMock).toHaveBeenCalledWith(TRIP, USER, { role: "assistant", content: "Hello world.", idempotencyKey: KEY, metadata: {} });
  });

  it("runs stripReasoning then the sanitizer on the FINAL text before persisting, and carries it on the meta frame", async () => {
    // The route's own reasoning gate strips harmony tokens upstream; this is the belt-and-braces
    // pass on the accumulated text (the raw frame is still teed through unchanged — it's a dumb tee).
    const harmony = "<|channel|>analysis<|message|>secret plan<|end|><|start|>assistant<|channel|>final<|message|>go to Bar Rouge<|return|>";
    const sanitize = (s: string) => s.toUpperCase();
    const meta = { surface: "explore", blocks: [] };
    const out = await drain(persistedAssistantStream(upstream(delta(harmony)), {} as never, TRIP, USER, KEY, sanitize, meta));
    expect(appendMock).toHaveBeenCalledWith(TRIP, USER, { role: "assistant", content: "GO TO BAR ROUGE", idempotencyKey: KEY, metadata: meta });
    const frame = JSON.parse(out.split("data: ").filter((l) => l.includes('"meta"'))[0].trim());
    expect(frame).toEqual({ meta, content: "GO TO BAR ROUGE" });
  });

  it("emits a final meta frame only when meta is supplied", async () => {
    const withMeta = await drain(persistedAssistantStream(upstream(delta("ok")), {} as never, TRIP, USER, KEY, undefined, { blocks: [] }));
    expect(withMeta).toContain('"meta"');
    const noMeta = await drain(persistedAssistantStream(upstream(delta("ok")), {} as never, TRIP, USER, KEY));
    expect(noMeta).not.toContain('"meta"');
  });

  it("a persist failure does not kill the stream — the meta frame still reaches the client, flagged as unsaved", async () => {
    appendMock.mockRejectedValueOnce(new Error("Invariant: static generation store missing in revalidateTag"));
    const meta = { surface: "chat", blocks: [{ type: "place_list", places: [] }] };
    const out = await drain(persistedAssistantStream(upstream(delta("the parks are A, B, C"), "data: [DONE]\n\n"), {} as never, TRIP, USER, KEY, undefined, meta));
    // the client still gets its answer + the structured blocks, but must not treat this as saved
    expect(out).toContain(delta("the parks are A, B, C"));
    const frame = JSON.parse(out.split("data: ").filter((l) => l.includes('"meta"'))[0].trim());
    expect(frame.meta).toEqual({ ...meta, persistFailed: true });
  });

  it("does not flag persistFailed when the write succeeds", async () => {
    const meta = { surface: "chat", blocks: [] };
    const out = await drain(persistedAssistantStream(upstream(delta("ok"), "data: [DONE]\n\n"), {} as never, TRIP, USER, KEY, undefined, meta));
    const frame = JSON.parse(out.split("data: ").filter((l) => l.includes('"meta"'))[0].trim());
    expect(frame.meta).toEqual(meta);
  });

  it("calls onComplete with the final text, and a throwing onComplete does not break the stream or the persist", async () => {
    const onComplete = vi.fn(() => { throw new Error("trace blew up"); });
    const out = await drain(persistedAssistantStream(upstream(delta("done")), {} as never, TRIP, USER, KEY, undefined, undefined, onComplete));
    expect(onComplete).toHaveBeenCalledWith("done");
    expect(appendMock).toHaveBeenCalledWith(TRIP, USER, expect.objectContaining({ content: "done" }));
    expect(out).toContain(delta("done")); // the stream still drained cleanly
  });

  it("does not persist when the text is empty and there is no meta", async () => {
    await drain(persistedAssistantStream(upstream("data: [DONE]\n\n"), {} as never, TRIP, USER, KEY));
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("still persists an empty answer when meta is present (a clarify / fallback turn)", async () => {
    await drain(persistedAssistantStream(upstream("data: [DONE]\n\n"), {} as never, TRIP, USER, KEY, undefined, { blocks: [{ type: "clarifying_question" }] }));
    expect(appendMock).toHaveBeenCalledWith(TRIP, USER, expect.objectContaining({ content: "", metadata: { blocks: [{ type: "clarifying_question" }] } }));
  });

  it("skips [DONE] and malformed frames without counting them as content, but still tees them", async () => {
    const out = await drain(persistedAssistantStream(upstream(delta("real "), "data: {bad json\n\n", delta("text"), "data: [DONE]\n\n"), {} as never, TRIP, USER, KEY));
    expect(appendMock).toHaveBeenCalledWith(TRIP, USER, expect.objectContaining({ content: "real text" }));
    expect(out).toContain("data: {bad json");
  });

  it("flags truncated in both the persisted metadata and the meta frame when the upstream signals an early end", async () => {
    const meta = { surface: "chat", blocks: [] };
    const truncatedFrame = `data: ${JSON.stringify({ truncated: true })}\n\n`;
    const out = await drain(persistedAssistantStream(upstream(delta("partial answer cut o"), truncatedFrame, "data: [DONE]\n\n"), {} as never, TRIP, USER, KEY, undefined, meta));
    expect(appendMock).toHaveBeenCalledWith(TRIP, USER, expect.objectContaining({ content: "partial answer cut o", metadata: { ...meta, truncated: true } }));
    const frame = JSON.parse(out.split("data: ").filter((l) => l.includes('"meta"'))[0].trim());
    expect(frame.meta).toEqual({ ...meta, truncated: true });
  });

  it("does not flag truncated on a clean finish", async () => {
    const meta = { surface: "chat", blocks: [] };
    const out = await drain(persistedAssistantStream(upstream(delta("a full answer"), "data: [DONE]\n\n"), {} as never, TRIP, USER, KEY, undefined, meta));
    const frame = JSON.parse(out.split("data: ").filter((l) => l.includes('"meta"'))[0].trim());
    expect(frame.meta).toEqual(meta);
  });

  it("cancel() cancels the upstream reader", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start() {}, cancel });
    const stream = persistedAssistantStream(body, {} as never, TRIP, USER, KEY);
    await stream.cancel();
    expect(cancel).toHaveBeenCalled();
  });

  it("runs sanitize and the meta thunk concurrently, not one after the other (Phase 3.2.2 mitigation)", async () => {
    // docs/overhaul/roadmap/phase-3-accuracy.md's 3.2.2: the grounding evaluator (sanitize) and a
    // caller's own side-builder wait (meta) don't depend on each other — before this, awaiting
    // them one after another stacked their durations together for no reason. Proof of concurrency:
    // both start (both mocks get called) before EITHER is allowed to resolve.
    let releaseSanitize: ((v: string) => void) | undefined;
    let releaseMeta: ((v: Record<string, unknown>) => void) | undefined;
    const sanitize = vi.fn(() => new Promise<string>((resolve) => { releaseSanitize = resolve; }));
    const meta = vi.fn(() => new Promise<Record<string, unknown>>((resolve) => { releaseMeta = resolve; }));
    const stream = persistedAssistantStream(upstream(delta("draft answer"), "data: [DONE]\n\n"), {} as never, TRIP, USER, KEY, sanitize, meta);
    const reader = stream.getReader();
    await reader.read(); // the raw delta, teed through unchanged
    await reader.read(); // the [DONE] sentinel, teed through unchanged
    const thirdRead = reader.read(); // pull() now blocked inside Promise.all([sanitize(), meta()])
    await new Promise((r) => setTimeout(r, 0));

    // Both already called — neither waited for the other to resolve first.
    expect(sanitize).toHaveBeenCalledWith("draft answer");
    expect(meta).toHaveBeenCalledTimes(1);

    releaseMeta?.({ blocks: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(appendMock).not.toHaveBeenCalled(); // still waiting on sanitize — meta resolving alone isn't enough

    releaseSanitize?.("FINAL TEXT");
    await thirdRead;
    expect(appendMock).toHaveBeenCalledWith(TRIP, USER, expect.objectContaining({ content: "FINAL TEXT", metadata: { blocks: [] } }));
  });

  it("does not crash and still persists once resolved, when a disconnect fires while an async sanitize call (Phase 3.2's grounding evaluator) is still in flight", async () => {
    // Phase 3.2 widened `sanitize` to allow a real async model round-trip — a disconnect racing
    // against that in-flight call, rather than against the plain synchronous regex sanitizer this
    // parameter used to carry alone, was never exercised by any existing test. A `ReadableStream`
    // can't reach into an already-running `pull()`, so the in-flight sanitize call resolves on its
    // own regardless of the cancel; the subsequent stale `controller.enqueue`/`close()` calls DO
    // throw (confirmed directly: "Invalid state: Controller is already closed"), guarded by this
    // file's own try/catch — but even without that guard, the runtime's own ReadableStream
    // machinery already swallows a `pull()`-internal throw after cancellation rather than letting
    // it surface as an unhandled rejection (confirmed the same way). So this test can't
    // specifically pin the try/catch as load-bearing; what it verifies is the actual externally-
    // observable guarantee that matters — the persist still completes correctly with the right
    // (late-arriving) text, and nothing hangs or crashes the test itself.
    let releaseSanitize: ((value: string) => void) | undefined;
    const sanitize = vi.fn(() => new Promise<string>((resolve) => { releaseSanitize = resolve; }));
    const stream = persistedAssistantStream(upstream(delta("draft answer"), "data: [DONE]\n\n"), {} as never, TRIP, USER, KEY, sanitize, { blocks: [] });
    const reader = stream.getReader();
    await reader.read(); // the raw delta, teed through unchanged
    await reader.read(); // the [DONE] sentinel, teed through unchanged
    const thirdRead = reader.read(); // pull() now blocked inside `await sanitize(...)`
    await new Promise((r) => setTimeout(r, 0));
    expect(sanitize).toHaveBeenCalledWith("draft answer");

    await expect(reader.cancel()).resolves.toBeUndefined(); // the simulated disconnect
    await expect(thirdRead).resolves.toBeDefined(); // never hangs or rejects

    releaseSanitize?.("SANITIZED ANSWER"); // let the still-in-flight evaluator call resolve late
    await new Promise((r) => setTimeout(r, 0)); // let its continuation (persist, stale enqueue/close) run
    expect(appendMock).toHaveBeenCalledWith(TRIP, USER, expect.objectContaining({ content: "SANITIZED ANSWER" }));
  });
});
