import { describe, expect, it } from "vitest";
import { createSseParser, parseSseJson, sseJson } from "../../packages/ai/sse";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(enc.encode(chunk));
      controller.close();
    },
  });
}

describe("parseSseJson", () => {
  it("parses a JSON payload", () => {
    expect(parseSseJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("returns undefined for [DONE] and for garbage", () => {
    expect(parseSseJson("[DONE]")).toBeUndefined();
    expect(parseSseJson('{"a":')).toBeUndefined();
  });
});

describe("createSseParser", () => {
  it("emits payloads split across chunk boundaries", () => {
    const p = createSseParser();
    expect(p.push('data: {"x":1}\nda')).toEqual(['{"x":1}']);
    expect(p.push('ta: {"y":2}\n')).toEqual(['{"y":2}']);
  });

  it("tolerates the optional single space and no space after data:", () => {
    const p = createSseParser();
    expect(p.push("data:{\"a\":1}\ndata: {\"b\":2}\n")).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("ignores blank and non-data lines, keeps [DONE]", () => {
    const p = createSseParser();
    expect(p.push("\n:ping\ndata: [DONE]\n")).toEqual(["[DONE]"]);
  });

  it("flush returns a final line with no trailing newline", () => {
    const p = createSseParser();
    expect(p.push('data: {"x":1}')).toEqual([]);
    expect(p.flush()).toEqual(['{"x":1}']);
    expect(p.flush()).toEqual([]);
  });
});

describe("sseJson", () => {
  it("yields each parsed payload and skips [DONE]", async () => {
    const out: unknown[] = [];
    for await (const e of sseJson(streamOf(
      'data: {"n":1}\n\n',
      'data: {"n":2}\n\n',
      "data: [DONE]\n\n",
    ))) out.push(e);
    expect(out).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("handles a payload arriving in two reads and a missing final newline", async () => {
    const out: unknown[] = [];
    for await (const e of sseJson(streamOf('data: {"hal', 'f":true}'))) out.push(e);
    expect(out).toEqual([{ half: true }]);
  });

  it("drops malformed frames without throwing", async () => {
    const out: unknown[] = [];
    for await (const e of sseJson(streamOf('data: {bad\n\ndata: {"ok":1}\n\n'))) out.push(e);
    expect(out).toEqual([{ ok: 1 }]);
  });
});
