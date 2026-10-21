import { streamText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { createReasoningGate } from "@/lib/ai/strip-reasoning";
import { logger } from "@/lib/server/logger";
import { isAbortError, textFrame, truncatedFrame } from "@/lib/server/ai-stream-frames";
import type { composeModelChain } from "@/packages/ai/compose-model";
import { AI_DEADLINE_MS, COMPOSE_MAX_STEPS, withDeadline } from "@/packages/ai/model-policy";

/** Fails when `promise` has not settled within `ms`, so a stalled provider cannot hang the turn. */
const withTtft = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("compose time-to-first-token exceeded")), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
};

/**
 * Opens the COMPOSE reply as an SSE byte stream: tries the primary model, then each fallback, until one produces its first
 * chunk (a stalled or failing provider moves on to the next). Reasoning-model scratchpad is held back from the live text. The
 * returned stream ends with a `truncated` frame if the model fails part-way. Throws when no model produced anything, or on an abort.
 *
 * `onModel` is told which model answered; `onUsage` its token counts once the stream finishes (some providers report none).
 */
export async function openComposeStream(args: {
  chain: ReturnType<typeof composeModelChain>;
  system: string;
  messages: ModelMessage[];
  tools: ToolSet;
  signal: AbortSignal;
  onModel: (modelId: string) => void;
  onUsage: (inputTokens: number, outputTokens: number) => void;
}): Promise<ReadableStream<Uint8Array>> {
  const { chain, system, messages, tools, signal, onModel, onUsage } = args;
  let iterator: AsyncIterator<string> | undefined;
  let firstChunk: IteratorResult<string> | undefined;
  let lastError: unknown;
  for (let i = 0; i < chain.length; i += 1) {
    const entry = chain[i];
    // Own controller per attempt: a TTFT timeout below only rejects the local race, it
    // doesn't touch the streamText call itself — without aborting here, a stalled
    // provider that's merely slow (not actually down) keeps running its tool-calling
    // loop against real paid APIs in the background after the route has already moved
    // to the next provider, uncounted by the turn's rate limit or cost trace.
    const attemptController = new AbortController();
    const streamResult = streamText({
      model: entry.model,
      system,
      messages,
      tools,
      stopWhen: stepCountIs(COMPOSE_MAX_STEPS),
      abortSignal: AbortSignal.any([attemptController.signal, withDeadline(signal, 60_000)]),
      onError: ({ error }) => {
        if (isAbortError(error)) return; // ordinary disconnect/timeout, not a real failure
        logger.error({ err: error }, "compose stream error");
      },
      ...(entry.providerOptions ? { providerOptions: entry.providerOptions } : {}),
    });
    try {
      const it = streamResult.textStream[Symbol.asyncIterator]();
      // Earlier attempts still have a fallback to move to, so they get a shorter leash —
      // only the last provider in the chain (nowhere left to fail over to) waits the
      // full, generous timeout.
      const ttft = i < chain.length - 1 ? AI_DEADLINE_MS.composeTtftFallback : AI_DEADLINE_MS.composeTtft;
      firstChunk = await withTtft(it.next(), ttft);
      iterator = it;
      onModel(entry.modelId);
      void streamResult.totalUsage.then(
        (u) => onUsage(u.inputTokens ?? 0, u.outputTokens ?? 0),
        () => undefined,
      );
      break;
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
      attemptController.abort();
      logger.warn({ err: error, attempt: i }, "compose model failed, trying next in chain");
    }
  }
  if (!iterator || !firstChunk) throw lastError ?? new Error("compose produced no model");

  // Hold reasoning-model scratchpad (harmony analysis channel, <think> blocks) back
  // from the live stream — it would otherwise flash on screen before the final settle
  // strips it.
  const gate = createReasoningGate();
  return new ReadableStream<Uint8Array>({
    async start(innerController) {
      const emit = (raw: string) => {
        const clean = gate(raw);
        if (clean) innerController.enqueue(textFrame(clean));
      };
      try {
        if (!firstChunk!.done && firstChunk!.value) emit(firstChunk!.value);
        for (;;) {
          const chunk = await iterator!.next();
          if (chunk.done) break;
          if (chunk.value) emit(chunk.value);
        }
      } catch (error) {
        if (!isAbortError(error)) logger.error({ err: error }, "compose stream ended early");
        // Signal this to persistedAssistantStream so the partial text gets flagged
        // rather than persisted and replayed as if it were a genuinely complete answer.
        innerController.enqueue(truncatedFrame());
      }
      innerController.close();
    },
  });
}
