/** Build an OpenAI-style SSE stream that yields `text` as one delta, optionally with a usage chunk. */
export function sse(text: string, usage?: { prompt_tokens: number; completion_tokens: number }): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of chunk(text)) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`));
      }
      if (usage) controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [], usage })}\n\n`));
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

/** Split into a few deltas so tests exercise multi-chunk accumulation. */
function chunk(text: string): string[] {
  if (text.length < 40) return [text];
  const mid = Math.floor(text.length / 2);
  const cut = text.indexOf(" ", mid);
  return cut === -1 ? [text] : [text.slice(0, cut), text.slice(cut)];
}
