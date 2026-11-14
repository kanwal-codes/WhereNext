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

/** A Gemini chain entry ("google/gemini-3.5-flash-lite" or a bare "gemini-…"). Only the structured path speaks to Gemini, over plain REST:
 *  no Google SDK is installed, and one JSON call needs nothing more. Every failure carries a `statusCode`, so `isRetryable` moves on to the next (Claude) entry. */
const isGemini = (modelId: string) => /^(google\/)?gemini-/.test(modelId);
const GEMINI_TIMEOUT_MS = 12_000;
/** After a 429 or 503 Gemini is left alone for a minute: a plain key's per-minute quota recovers on that scale, and hammering it
 *  would only add a wasted round trip to every call. Keyed by model, per process. */
const GEMINI_COOLDOWN_MS = 60_000;
const geminiPausedUntil = new Map<string, number>();
const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

const messageText = (content: ModelMessage["content"]) =>
  typeof content === "string" ? content : content.map((part) => ("text" in part && typeof part.text === "string" ? part.text : "")).join("");

async function geminiStructured<T>(modelId: string, messages: ModelMessage[], schema: z.ZodType<T>, signal: AbortSignal | undefined, onUsage?: (entry: UsageEntry) => void): Promise<T> {
  const key = process.env.GOOGLE_GEMINI_API;
  if (!key) throw httpError("GOOGLE_GEMINI_API is not set", 401);
  const name = modelId.replace(/^google\//, "");
  if ((geminiPausedUntil.get(name) ?? 0) > Date.now()) throw httpError(`${name} is cooling down after a rate limit`, 429);

  const prepared = withJsonInstruction(messages, schema);
  const system = prepared.filter((m) => m.role === "system").map((m) => messageText(m.content)).join("\n\n");
  const contents = prepared.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: messageText(m.content) }] }));
  const timeout = AbortSignal.timeout(GEMINI_TIMEOUT_MS);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent`, {
    method: "POST",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { responseMimeType: "application/json", maxOutputTokens: STRUCTURED_MAX_TOKENS } }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: { status?: string; message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  if (!response.ok) {
    if (response.status === 429 || response.status === 503) geminiPausedUntil.set(name, Date.now() + GEMINI_COOLDOWN_MS);
    throw httpError(`Gemini ${response.status} ${body.error?.status ?? ""}: ${body.error?.message ?? ""}`.slice(0, 300), response.status);
  }
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
  const usage = body.usageMetadata;
  onUsage?.({ model: modelId, promptTokens: usage?.promptTokenCount ?? 0, completionTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0) });
  return schema.parse(extractJson(text));
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
    if (isGemini(modelId)) return geminiStructured(modelId, prepared, schema, signal, onUsage);
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
export function modelChain(chain: ModelChainEntry[], lowThinkingOn = true): Array<{ model: ReturnType<typeof anthropic>; modelId: string; providerOptions?: ProviderOptions }> {
  return chain.map((entry) => ({ model: modelFor(entry), modelId: entry.replace(/^anthropic\//, ""), ...(lowThinkingOn ? { providerOptions: lowThinking(entry) } : {}) }));
}

/**
 * Thinking as low as the model allows, for the streamed reply. The SDK leaves these models on adaptive thinking, which spends 1.8-4.3 s
 * (Haiku 5.5) and 3-4.5 s (Sonnet 5.5) on hidden reasoning before the first word of a plain reply; with it off the first word arrives in
 * ~0.5 s and ~0.8 s (replay of real compose prompts, 2026-11-14). Sonnet 5.5 cannot switch thinking off, only down to "between_tools"
 * (think only between tool calls); Haiku rejects that value, so it is switched off. Only the reply writer gets this: with it on the router
 * and the card builders (full battery, 2026-11-14) replies got no faster to start but the router filed more messages differently and
 * flagged replies went from 12 to 22 of 37. An urgent message ("I'm lost", "missed my flight") keeps full thinking: with it low those
 * replies doubled in length (48 to 94 words) and the first action is what the person needs.
 */
const lowThinking = (entry: ModelChainEntry): ProviderOptions => ({ anthropic: { thinking: { type: /sonnet-5-5/.test(entry) ? "between_tools" : "disabled" } } });
