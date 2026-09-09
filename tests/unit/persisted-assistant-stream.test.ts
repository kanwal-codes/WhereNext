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

  it("cancel() cancels the upstream reader", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start() {}, cancel });
    const stream = persistedAssistantStream(body, {} as never, TRIP, USER, KEY);
    await stream.cancel();
    expect(cancel).toHaveBeenCalled();
  });
});
