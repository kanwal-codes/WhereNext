import type { SupabaseClient } from "@supabase/supabase-js";
import { createConversationRepository } from "../infrastructure/conversationRepository";
import { stripReasoning } from "@/lib/ai/strip-reasoning";
import { createSseParser, parseSseJson } from "@/packages/ai/sse";
import { logger } from "@/lib/server/logger";

type StreamDelta = { choices?: Array<{ delta?: { content?: string } }>; truncated?: boolean };

/**
 * Tees the provider SSE stream to the client while accumulating the assistant text.
 * On completion it persists the (optionally sanitized) text plus `meta` to the
 * conversation row, and emits one final `data: {"meta": ...}` frame so the client
 * gets the structured blocks after the text is done.
 */
export function persistedAssistantStream(
  body: ReadableStream<Uint8Array>,
  supabase: SupabaseClient,
  tripId: string,
  userId: string,
  idempotencyKey: string,
  // Phase 3.2 (docs/overhaul/roadmap/phase-3-accuracy.md): may now return a Promise — the
  // grounding evaluator is a real model round-trip, unlike the regex-only sanitizer this
  // parameter originally carried alone. Every existing caller returning a plain `string` still
  // works unchanged (`await` on a non-Promise value just resolves to it immediately).
  sanitize?: (content: string) => string | Promise<string>,
  // Phase 2.6.2 (docs/overhaul/roadmap/phase-2-speed.md): a thunk, not just a plain value — the
  // route now returns this stream's Response BEFORE `runAssistantTurn` resolves (so it can flush
  // early progress frames during RESOLVE/RETRIEVE), so `meta` isn't known yet at call time. A
  // plain value still works unchanged for every other caller/test.
  // Phase 3.2.2 mitigation (docs/overhaul/roadmap/phase-3-accuracy.md): may now also return a
  // Promise, same as `sanitize` above — lets a caller's thunk await its own side-builders (the
  // checklist/comparison blocks) without blocking `sanitize`'s grounding-evaluator call from
  // starting first. See the `Promise.all` below: the two now run concurrently instead of
  // strictly sequentially, since neither depends on the other's result.
  meta?: Record<string, unknown> | (() => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>),
  onComplete?: (finalText: string) => void | Promise<void>,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const parser = createSseParser();
  let assistant = "";
  // Set when the upstream route's own stream ends early (a provider dropped the connection,
  // or its hard deadline fired) and signals that via a `{"truncated":true}` frame instead of a
  // clean finish — without this, a cut-off answer persists and later reloads indistinguishably
  // from a genuinely complete one.
  let truncated = false;
  // A malformed provider event is dropped by parseSseJson; the raw stream still passes through.
  const absorb = (payloads: string[]) => {
    for (const payload of payloads) {
      const parsed = parseSseJson<StreamDelta>(payload);
      const content = parsed?.choices?.[0]?.delta?.content;
      if (content) assistant += content;
      if (parsed?.truncated) truncated = true;
    }
  };

  // Guards the `chunk.done` branch below: a disconnect can call this stream's own `cancel()`
  // while `pull()` is still awaiting persistence/tracing work from a *previous* read, and a
  // `controller.enqueue`/`close()` call after that would throw instead of no-op, since the
  // stream has already left the "readable" state by then.
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read();
      if (cancelled) return;
      if (chunk.done) {
        absorb(parser.push(decoder.decode()));
        absorb(parser.flush());
        const clean = stripReasoning(assistant);
        // Concurrent, not sequential: `sanitize` (the grounding evaluator, a real model round
        // trip) needs only the finished text above, not whatever `meta`'s own thunk is doing —
        // typically awaiting side-builders (checklist/comparison blocks) that already started
        // well before this point. Awaiting them one after the other added their two durations
        // together for no reason; `Promise.all` overlaps them.
        const [finalText, resolvedMeta] = await Promise.all([
          Promise.resolve(sanitize ? sanitize(clean) : clean),
          Promise.resolve(typeof meta === "function" ? meta() : meta),
        ]);
        const outMeta = truncated ? { ...resolvedMeta, truncated: true } : resolvedMeta;
        let persistFailed = false;
        if (finalText || resolvedMeta) {
          try {
            await createConversationRepository(supabase).append(tripId, userId, { role: "assistant", content: finalText, idempotencyKey, metadata: outMeta ?? {} });
          } catch (error) {
            // Persistence failed (DB error, or a revalidate call landing outside a request
            // context). The client still gets its answer + blocks from the meta frame below —
            // but flagged, so it renders as "not saved" rather than a good answer gone quiet.
            persistFailed = true;
            logger.error({ err: error, tripId }, "assistant turn persist failed");
          }
        }
        try {
          await onComplete?.(finalText);
        } catch {
          /* tracing must never break the response */
        }
        // The final frame carries the sanitized text too, so the client can settle on the persisted
        // content without refetching the conversation. Persist/onComplete above are real I/O that
        // can outlast a disconnect firing this stream's own `cancel()` mid-await — guard the writes
        // below so that stale close/enqueue is a no-op instead of an uncaught TypeError.
        try {
          if (meta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: persistFailed ? { ...outMeta, persistFailed } : outMeta, content: finalText })}\n\n`));
          controller.close();
        } catch { /* already closed/errored by cancel() — nothing left to do */ }
        return;
      }
      absorb(parser.push(decoder.decode(chunk.value, { stream: true })));
      controller.enqueue(chunk.value);
    },
    async cancel() { cancelled = true; await reader.cancel(); },
  });
}
