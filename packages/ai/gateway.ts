export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
import { OpenAiCompatibleProvider } from "./providers/openai-compatible";

export type AiProviderName = "openai" | "openai-compatible" | "cerebras" | "gemini";

// `||` not `??` everywhere below: the env template ships these keys blank, and an
// empty string must fall through to the default, not count as a real value.
const OPENAI = {
  baseUrl: "https://api.openai.com/v1",
  key: () => process.env.AI_API_KEY || process.env.OPENAI_API_KEY,
  defaultModel: "gpt-4o",
  reasoning: false,
  envHint: "AI_API_KEY or OPENAI_API_KEY",
} as const;

const PROVIDERS: Record<AiProviderName, { baseUrl: string; key: () => string | undefined; defaultModel: string; reasoning: boolean; envHint: string }> = {
  openai: OPENAI,
  "openai-compatible": OPENAI,
  cerebras: {
    baseUrl: "https://api.cerebras.ai/v1",
    key: () => process.env.CEREBRAS_API_KEY,
    defaultModel: "gpt-oss-120b",
    reasoning: true,
    envHint: "CEREBRAS_API_KEY",
  },
  gemini: {
    // Gemini speaks OpenAI's protocol at this path, so the existing provider works unchanged.
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    key: () => process.env.GEMINI_API_KEY,
    defaultModel: "gemini-2.5-flash",
    reasoning: false,
    envHint: "GEMINI_API_KEY",
  },
};

export type ResolvedProvider = { apiKey: string; model: string; baseUrl: string; supportsReasoningOptions: boolean };

/**
 * Resolve the OpenAI-compatible endpoint to talk to. `AI_PROVIDER` (+ `AI_BASE_URL` /
 * `AI_MODEL`) picks the primary provider; `{ provider }` pins one regardless of env — a
 * pinned provider ignores `AI_BASE_URL` / `AI_MODEL` and uses its own defaults. Shared by
 * `createAiGateway` (structured/legacy calls) and `composeModel` (the AI SDK tool loop).
 */
export function resolveProvider(overrides: { model?: string; provider?: AiProviderName } = {}): ResolvedProvider {
  const pinned = overrides.provider != null;
  const name: AiProviderName = overrides.provider ?? (process.env.AI_PROVIDER as AiProviderName) ?? "openai-compatible";
  const p = PROVIDERS[name] ?? PROVIDERS["openai-compatible"];
  const key = p.key();
  if (!key) throw new Error(`${p.envHint} is not configured`);
  return {
    apiKey: key,
    model: overrides.model || (pinned ? p.defaultModel : process.env.AI_MODEL || p.defaultModel),
    baseUrl: pinned ? p.baseUrl : process.env.AI_BASE_URL || p.baseUrl,
    supportsReasoningOptions: p.reasoning,
  };
}

/** The chat/reasoning gateway used by every structured call (`generateText` / `generateStructured`). */
export function createAiGateway(overrides: { model?: string; provider?: AiProviderName } = {}) {
  return new OpenAiCompatibleProvider(resolveProvider(overrides));
}

/**
 * Primary + fallback providers. `AI_PROVIDER` is the primary (honours `AI_BASE_URL` /
 * `AI_MODEL`); `AI_FALLBACK_PROVIDERS` is a comma list tried in order when the primary
 * fails (`AI_FALLBACK_PROVIDERS=gemini,openai`). Each fallback is pinned to its own
 * endpoint + default model. Providers with no configured key are dropped. Throws only if
 * nothing in the chain is usable (with the primary's env hint).
 */
export function resolveProviderChain(overrides: { model?: string } = {}): ResolvedProvider[] {
  const names = [
    (process.env.AI_PROVIDER as AiProviderName) || "openai-compatible",
    ...(process.env.AI_FALLBACK_PROVIDERS ?? "")
      .split(",").map((s) => s.trim()).filter(Boolean) as AiProviderName[],
  ];
  const seen = new Set<string>();
  const chain: ResolvedProvider[] = [];
  let firstError: unknown;
  names.forEach((name, index) => {
    if (seen.has(name)) return;
    seen.add(name);
    try {
      // index 0 is the primary — let it honour AI_BASE_URL / AI_MODEL; fallbacks are pinned.
      chain.push(resolveProvider(index === 0 ? { model: overrides.model } : { provider: name, model: overrides.model }));
    } catch (error) {
      firstError ??= error;
    }
  });
  if (chain.length === 0) throw firstError ?? new Error("no AI provider configured");
  return chain;
}

const isAbort = (error: unknown) =>
  error instanceof DOMException ? error.name === "AbortError" : (error as { name?: string })?.name === "AbortError";

/** A gateway that transparently fails over across `resolveProviderChain()` on a provider error
 *  (network, 401/403/429, 5xx). A 4xx that another provider can't fix, and aborts, propagate. */
export function createGatewayWithFallback(overrides: { model?: string } = {}) {
  const providers = resolveProviderChain(overrides).map((r) => new OpenAiCompatibleProvider(r));
  async function withFailover<T>(op: (p: OpenAiCompatibleProvider) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < providers.length; i += 1) {
      try {
        return await op(providers[i]);
      } catch (error) {
        if (isAbort(error)) throw error;
        const status = (error as { status?: number })?.status;
        const worthRetrying = !status || status === 401 || status === 403 || status === 429 || status >= 500;
        if (!worthRetrying || i === providers.length - 1) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }
  return {
    generateText: (...args: Parameters<OpenAiCompatibleProvider["generateText"]>) => withFailover((p) => p.generateText(...args)),
    generateStructured: (...args: Parameters<OpenAiCompatibleProvider["generateStructured"]>) => withFailover((p) => p.generateStructured(...args)),
    stream: (...args: Parameters<OpenAiCompatibleProvider["stream"]>) => withFailover((p) => p.stream(...args)),
  };
}

/**
 * Cheap, huge-context model for bulk extraction / summarisation of long or
 * low-stakes text — web-page import, event blurbs, hotel descriptions, thread
 * summaries. Routes to Gemini Flash when `GEMINI_API_KEY` is set; otherwise it
 * transparently falls back to the primary gateway, so nothing breaks without a key.
 */
export function createBulkGateway(overrides: { model?: string } = {}) {
  if (!process.env.GEMINI_API_KEY) return createAiGateway(overrides);
  return createAiGateway({ provider: "gemini", model: overrides.model || process.env.GEMINI_BULK_MODEL || undefined });
}
