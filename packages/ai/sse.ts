/**
 * One SSE reader for every place that consumes an OpenAI-style `data:` stream —
 * the client transport, the server persist-and-tee, the compare-chat relay, and the
 * usage sniffer. Isomorphic: no imports, nothing platform-only.
 *
 * Two shapes, because the callers differ:
 *   - `sseJson(body)` fully consumes a stream and yields each parsed payload
 *     (client transport, which reads to the end).
 *   - `createSseParser()` is a stateful chunk→payloads splitter for the callers
 *     that also forward or transform the raw bytes and can't hand the stream away.
 */

/** The payload of one SSE line (`data:` prefix + its optional single space removed), or null
 *  for a non-`data:` or blank line. `[DONE]` is returned verbatim so callers can act on it. */
function payloadOf(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const body = trimmed.slice(5).replace(/^ /, "");
  return body === "" ? null : body;
}

/** Parse one payload as JSON. `undefined` for `[DONE]` or a malformed/partial frame. */
export function parseSseJson<T = unknown>(payload: string): T | undefined {
  if (payload === "[DONE]") return undefined;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return undefined;
  }
}

/** Buffers partial text across chunks and emits complete `data:` payloads. */
export function createSseParser() {
  let buffer = "";
  return {
    /** Payloads completed by this text chunk. */
    push(text: string): string[] {
      buffer += text;
      const out: string[] = [];
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const payload = payloadOf(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (payload !== null) out.push(payload);
      }
      return out;
    },
    /** A final line with no trailing newline — some providers omit it. Call once at end-of-stream. */
    flush(): string[] {
      if (!buffer) return [];
      const payload = payloadOf(buffer);
      buffer = "";
      return payload !== null ? [payload] : [];
    },
  };
}

/** Fully consume a byte stream, yielding each JSON-parsed `data:` payload. `[DONE]` and
 *  malformed frames are skipped. The reader lock is always released. */
export async function* sseJson<T = unknown>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const payload of parser.push(decoder.decode(value, { stream: true }))) {
        const parsed = parseSseJson<T>(payload);
        if (parsed !== undefined) yield parsed;
      }
    }
    for (const payload of [...parser.push(decoder.decode()), ...parser.flush()]) {
      const parsed = parseSseJson<T>(payload);
      if (parsed !== undefined) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}
