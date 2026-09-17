import { gateway, generateObject, generateText as sdkGenerateText, streamObject, type DeepPartial, type ModelMessage } from "ai";
import type { z } from "zod";
import type { UsageEntry } from "@/lib/ai/pricing";
// Type-only: model-policy.ts imports real values from this file, so a value import back would
// be circular. `import type` is fully erased at compile time — zero runtime dependency either way.
import type { ModelChainEntry } from "./model-policy";

export type { ModelMessage };

const chainEntryId = (entry: ModelChainEntry): string => (typeof entry === "string" ? entry : entry.id);
/** Exported so `compose-model.ts`'s `ComposeModel.providerOptions` can reference this exact shape
 *  instead of hand-duplicating it — keeps the two in sync if this ever gains another option. */
export type GatewayProviderOptions = { gateway: { only?: string[]; caching?: "auto" } };
/** `providerOptions` for a Gateway call: `only` pins one specific underlying inference provider
 *  (bare string entry = no pin), `caching` asks the Gateway to cache this prompt (Phase 2.4,
 *  docs/overhaul/roadmap/phase-2-speed.md) — a no-op for a provider that already caches
 *  implicitly, only doing anything real for an explicit-caching one (Anthropic/MiniMax/Alibaba).
 *  `undefined` when neither applies, so a plain call stays byte-identical to before either existed. */
const providerOptionsFor = (entry: ModelChainEntry, caching?: "auto"): GatewayProviderOptions | undefined => {
  const only = typeof entry === "string" ? undefined : entry.only;
  return only || caching ? { gateway: { ...(only ? { only } : {}), ...(caching ? { caching } : {}) } } : undefined;
};

const isAbort = (error: unknown) =>
  error instanceof DOMException ? error.name === "AbortError" : (error as { name?: string })?.name === "AbortError";

/** Same retry policy the old hand-rolled multi-provider chain used: fail over on anything that
 *  might be transient (no status at all, auth hiccup, rate limit, 5xx, or an internal abort from
 *  a per-attempt timeout) — never on a real 4xx the next model can't fix either. */
function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number; statusCode?: number })?.status ?? (error as { statusCode?: number })?.statusCode;
  return !status || status === 401 || status === 403 || status === 429 || status >= 500;
}

/**
 * Try each Gateway model id in order until one succeeds. Every provider now goes through the
 * SAME client (Vercel AI Gateway, one API key) — there is no more per-provider baseURL/key/
 * reasoning-flag resolution to hand-roll; "fallback" here is purely "which model answered."
 * `externalSignal` is the caller's own abort (Stop, navigation) — an abort from THAT signal
 * propagates immediately instead of being treated as a retryable per-model failure.
 */
async function withModelFallback<T>(
  chain: ModelChainEntry[],
  op: (model: ReturnType<typeof gateway>, modelId: string, providerOptions?: GatewayProviderOptions) => Promise<T>,
  externalSignal?: AbortSignal,
  caching?: "auto",
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < chain.length; i += 1) {
    const entry = chain[i];
    const modelId = chainEntryId(entry);
    try {
      return await op(gateway(modelId), modelId, providerOptionsFor(entry, caching));
    } catch (error) {
      if (isAbort(error) && externalSignal?.aborted) throw error;
      if (!isRetryable(error) || i === chain.length - 1) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * One structured-JSON call through the Gateway, trying each model in `chain` in order.
 * Uses the AI SDK's native `generateObject` — schema-constrained decoding on providers that
 * support it, full Zod validation (including lenient `.catch()`/`.transform()` recovery) on
 * the result either way. Replaces the old hand-rolled `response_format: json_object` +
 * regex-extract-the-first-`{...}` + manual `.parse()` pattern.
 */
export async function generateStructured<T>(
  chain: ModelChainEntry[],
  messages: ModelMessage[],
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  onUsage?: (entry: UsageEntry) => void,
  opts?: { caching?: "auto" },
): Promise<T> {
  return withModelFallback(chain, async (model, modelId, providerOptions) => {
    const result = await generateObject({ model, schema, messages, abortSignal: signal, allowSystemInMessages: true, ...(providerOptions ? { providerOptions } : {}) });
    onUsage?.({ model: modelId, promptTokens: result.usage.inputTokens ?? 0, completionTokens: result.usage.outputTokens ?? 0 });
    return result.object;
  }, signal, opts?.caching);
}

/**
 * NOT CALLED FROM LIVE CODE — see the long comment on `model-policy.ts`'s `generateStructured`.
 * Live-verified: `result.object` hangs forever when invoked from inside this app's actual
 * Next.js route context (works fine as a standalone script). Kept correct and unit-tested
 * (`tests/unit/gateway-fallback.test.ts`) as a documented, known-broken-in-this-app starting
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
  return withModelFallback(chain, async (model, modelId, providerOptions) => {
    const result = streamObject({ model, schema, messages, abortSignal: signal, allowSystemInMessages: true, ...(providerOptions ? { providerOptions } : {}) });
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
  }, signal, opts?.caching);
}

/** One plain-text call through the Gateway, same model-fallback semantics as `generateStructured`. */
export async function generateText(
  chain: ModelChainEntry[],
  messages: ModelMessage[],
  signal?: AbortSignal,
  onUsage?: (entry: UsageEntry) => void,
): Promise<string> {
  return withModelFallback(chain, async (model, modelId, providerOptions) => {
    const result = await sdkGenerateText({ model, messages, abortSignal: signal, allowSystemInMessages: true, ...(providerOptions ? { providerOptions } : {}) });
    onUsage?.({ model: modelId, promptTokens: result.usage.inputTokens ?? 0, completionTokens: result.usage.outputTokens ?? 0 });
    if (!result.text) throw new Error("AI provider returned an empty response");
    return result.text;
  }, signal);
}

/** The COMPOSE stage's model chain as real AI SDK `LanguageModel`s, for the routes' own
 *  streaming + bounded tool-calling loop — that needs per-attempt time-to-first-token racing
 *  and manual step control that a single `generateText`/`generateStructured` call above doesn't
 *  expose. Each entry is just a Gateway-resolved model; there is no more per-provider request
 *  shape to build. `providerOptions` is included only when the entry actually pins a provider —
 *  compose's own chain has no pinned entries today, so this is `undefined` in practice. */
export function gatewayModelChain(chain: ModelChainEntry[]): Array<{ model: ReturnType<typeof gateway>; modelId: string; providerOptions?: GatewayProviderOptions }> {
  return chain.map((entry) => ({ model: gateway(chainEntryId(entry)), modelId: chainEntryId(entry), providerOptions: providerOptionsFor(entry) }));
}
