import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText as sdkGenerateText, streamObject, type DeepPartial, type ModelMessage } from "ai";
import { z } from "zod";
import type { UsageEntry } from "@/lib/ai/pricing";
// Type-only: model-policy.ts imports real values from this file, so a value import back would
// be circular. `import type` is fully erased at compile time — zero runtime dependency either way.
import type { ModelChainEntry } from "./model-policy";

export type { ModelMessage };

/** Per-provider options forwarded to the AI SDK call (e.g. `{ anthropic: { cacheControl: ... } }`). */
export type ProviderOptions = NonNullable<Parameters<typeof sdkGenerateText>[0]["providerOptions"]>;

/** The Anthropic model for a chain entry. A leading "anthropic/" (the old Gateway spelling) is accepted and dropped. */
const modelFor = (entry: ModelChainEntry) => anthropic(entry.replace(/^anthropic\//, ""));

/** Marks the system prompt as cacheable: a prompt that repeats on every turn is read back from Anthropic's cache
 *  (faster, and a tenth of the input price) instead of being processed again. */
const withCachedSystem = (messages: ModelMessage[]): ModelMessage[] => {
  const index = messages.findIndex((m) => m.role === "system");
  if (index < 0) return messages;
  return messages.map((m, i) => (i === index ? { ...m, providerOptions: { ...m.providerOptions, anthropic: { cacheControl: { type: "ephemeral" } } } } : m));
};

const isAbort = (error: unknown) =>
  error instanceof DOMException ? error.name === "AbortError" : (error as { name?: string })?.name === "AbortError";

/** Fail over on anything that might be transient (no status at all, auth hiccup, rate limit, 5xx
 *  including Anthropic's 529 "overloaded", or an internal abort from a per-attempt timeout) — never
 *  on a real 4xx the next model can't fix either. */
function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number; statusCode?: number })?.status ?? (error as { statusCode?: number })?.statusCode;
  return !status || status === 401 || status === 403 || status === 429 || status >= 500;
}

/**
 * Try each model in order until one succeeds. Every call goes straight to Anthropic's API with
 * `ANTHROPIC_API_KEY`; "fallback" here is purely "which Claude model answered."
 * `externalSignal` is the caller's own abort (Stop, navigation) — an abort from THAT signal
 * propagates immediately instead of being treated as a retryable per-model failure.
 */
async function withModelFallback<T>(
  chain: ModelChainEntry[],
  op: (model: ReturnType<typeof anthropic>, modelId: string) => Promise<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < chain.length; i += 1) {
    const entry = chain[i];
    const modelId = entry.replace(/^anthropic\//, "");
    try {
      return await op(anthropic(modelId), modelId);
    } catch (error) {
      if (isAbort(error) && externalSignal?.aborted) throw error;
      if (!isRetryable(error) || i === chain.length - 1) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/** Output cap per call. The SDK would otherwise ask for the model's maximum (128k), which is not what a plan or a blurb needs. */
const STRUCTURED_MAX_TOKENS = 8_000;
const TEXT_MAX_TOKENS = 4_000;

/** Schemas Anthropic's constrained decoding refused (it caps optional fields and nesting). They are asked for as plain JSON from then on. */
const nativeRefused = new WeakSet<object>();
const isSchemaRefusal = (error: unknown) =>
  (error as { statusCode?: number })?.statusCode === 400 && /schema|optional parameters|grammar/i.test((error as { message?: string }).message ?? "");

/** The system messages with a "reply as JSON matching this schema" instruction added to the first one (or as a new first one). */
function withJsonInstruction(messages: ModelMessage[], schema: z.ZodType): ModelMessage[] {
  const instruction = `Reply with ONLY a single JSON object that validates against this JSON Schema. No markdown fences, no commentary.\n${JSON.stringify(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }))}`;
  const index = messages.findIndex((m) => m.role === "system");
  if (index < 0) return [{ role: "system", content: instruction }, ...messages];
  return messages.map((m, i) => (i === index && m.role === "system" ? { ...m, content: `${m.content}\n\n${instruction}` } : m));
}

/** The first `{ ... }` in a model reply, so a stray sentence or fence around the JSON does not fail the call. */
const extractJson = (text: string) => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("model reply had no JSON object");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
};

/**
 * One structured-JSON call, trying each model in `chain` in order.
 * Asks for schema-constrained output (`generateObject`) first. A schema Anthropic refuses as too
 * complex (RESOLVE's plan has 30 optional fields against a limit of 24) is remembered and asked for as
 * plain JSON from then on — one wasted call per schema per process, not per turn. Either way the result
 * goes through full Zod validation, including the lenient `.catch()`/`.transform()` recovery.
 */
export async function generateStructured<T>(
  chain: ModelChainEntry[],
  messages: ModelMessage[],
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  onUsage?: (entry: UsageEntry) => void,
  opts?: { caching?: "auto" },
): Promise<T> {
  const prepared = opts?.caching ? withCachedSystem(messages) : messages;
  return withModelFallback(chain, async (model, modelId) => {
    if (!nativeRefused.has(schema)) {
      try {
        const result = await generateObject({ model, schema, messages: prepared, maxOutputTokens: STRUCTURED_MAX_TOKENS, abortSignal: signal, allowSystemInMessages: true });
        onUsage?.({ model: modelId, promptTokens: result.usage.inputTokens ?? 0, completionTokens: result.usage.outputTokens ?? 0 });
        return result.object;
      } catch (error) {
        if (!isSchemaRefusal(error)) throw error;
        nativeRefused.add(schema);
      }
    }
    const result = await sdkGenerateText({ model, messages: withJsonInstruction(prepared, schema), maxOutputTokens: STRUCTURED_MAX_TOKENS, abortSignal: signal, allowSystemInMessages: true });
    onUsage?.({ model: modelId, promptTokens: result.usage.inputTokens ?? 0, completionTokens: result.usage.outputTokens ?? 0 });
    return schema.parse(extractJson(result.text));
  }, signal);
}

/**
 * NOT CALLED FROM LIVE CODE — see the long comment on `model-policy.ts`'s `generateStructured`.
 * Live-verified: `result.object` hangs forever when invoked from inside this app's actual
 * Next.js route context (works fine as a standalone script). Kept correct and unit-tested
 * (`tests/unit/llm-fallback.test.ts`) as a documented, known-broken-in-this-app starting
 * point for whoever investigates the Next.js/AI-SDK streaming interaction later — do not wire
 * this back into `model-policy.ts` without first confirming that root cause is actually fixed.
 *
 * Like `generateStructured`, but backed by the AI SDK's `streamObject` (Phase 2.6.1,
 * docs/overhaul/roadmap/phase-2-speed.md) instead of `generateObject` — a caller watching the raw
 * HTTP response can see JSON arrive progressively instead of a single silent wait, without
 * changing what's ultimately returned: this still resolves (or rejects, on the same retryable-
 * error/fallback terms as `generateStructured`) with the one final, fully-validated object.
 * `onPartial`, when given, is called with each partial object as it streams in, for progress UI —
 * it never affects the awaited return value, and a consumer that throws doesn't fail the call.
 */
export async function streamStructured<T>(
  chain: ModelChainEntry[],
  messages: ModelMessage[],
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  onUsage?: (entry: UsageEntry) => void,
  opts?: { caching?: "auto"; onPartial?: (partial: DeepPartial<T>) => void },
): Promise<T> {
  return withModelFallback(chain, async (model, modelId) => {
    const result = streamObject({ model, schema, messages: opts?.caching ? withCachedSystem(messages) : messages, abortSignal: signal, allowSystemInMessages: true });
    if (opts?.onPartial) {
      const onPartial = opts.onPartial;
      // Detached: this loop and the `await result.object` below both read the same underlying
      // stream independently (the SDK tees it, same pattern the COMPOSE route already relies on
      // for `textStream` + `totalUsage`) — a partial-consumer error must not fail the real call.
      void (async () => {
        try {
          for await (const partial of result.partialObjectStream) onPartial(partial as DeepPartial<T>);
        } catch {
          // Swallowed — `await result.object` below is the call's real success/failure signal.
        }
      })();
    }
    const [object, usage] = await Promise.all([result.object, result.usage]);
    onUsage?.({ model: modelId, promptTokens: usage.inputTokens ?? 0, completionTokens: usage.outputTokens ?? 0 });
    return object;
  }, signal);
}

/** One plain-text call, same model-fallback semantics as `generateStructured`. */
export async function generateText(
  chain: ModelChainEntry[],
  messages: ModelMessage[],
  signal?: AbortSignal,
  onUsage?: (entry: UsageEntry) => void,
): Promise<string> {
  return withModelFallback(chain, async (model, modelId) => {
    const result = await sdkGenerateText({ model, messages, maxOutputTokens: TEXT_MAX_TOKENS, abortSignal: signal, allowSystemInMessages: true });
    onUsage?.({ model: modelId, promptTokens: result.usage.inputTokens ?? 0, completionTokens: result.usage.outputTokens ?? 0 });
    if (!result.text) throw new Error("AI provider returned an empty response");
    return result.text;
  }, signal);
}

/** The COMPOSE stage's model chain as real AI SDK `LanguageModel`s, for the routes' own
 *  streaming + bounded tool-calling loop — that needs per-attempt time-to-first-token racing
 *  and manual step control that a single `generateText`/`generateStructured` call above doesn't
 *  expose. `providerOptions` stays on the shape so a route can forward one if an entry ever needs it. */
export function modelChain(chain: ModelChainEntry[]): Array<{ model: ReturnType<typeof anthropic>; modelId: string; providerOptions?: ProviderOptions }> {
  return chain.map((entry) => ({ model: modelFor(entry), modelId: entry.replace(/^anthropic\//, "") }));
}
