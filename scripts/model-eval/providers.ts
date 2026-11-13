/**
 * One call shape for the three providers, with the retries a real app would need (overload, rate limits) and a per-provider cap on
 * calls in flight. The app itself only talks to Anthropic today (packages/ai/llm.ts); this is for measuring the others.
 */
export type Provider = "anthropic" | "openai" | "gemini";
export type Model = { provider: Provider; id: string; tier: "main" | "fast" };
export type CallResult = { text: string; ms: number; inTok: number; outTok: number; retries: number; error?: string };

export const MODELS: Model[] = [
  { provider: "anthropic", id: "claude-sonnet-5-5", tier: "main" },
  { provider: "openai", id: "gpt-5.5", tier: "main" },
  { provider: "gemini", id: "gemini-3-flash-preview", tier: "main" },
  { provider: "anthropic", id: "claude-haiku-5-5", tier: "fast" },
  { provider: "openai", id: "gpt-5.4-mini", tier: "fast" },
  { provider: "gemini", id: "gemini-3.5-flash-lite", tier: "fast" },
];

/** A tiny semaphore: at most `n` calls in flight per provider, so a 300-call run does not look like an attack to any of them. */
function limiter(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try { return await task(); } finally { active -= 1; queue.shift()?.(); }
  };
}
/** GEMINI_CONCURRENCY and GEMINI_GAP_MS slow Gemini down: a plain key has a low requests-per-minute quota that a parallel run exceeds. */
const gates: Record<Provider, ReturnType<typeof limiter>> = { anthropic: limiter(4), openai: limiter(4), gemini: limiter(Number(process.env.GEMINI_CONCURRENCY ?? 3)) };
const GAP = { anthropic: 0, openai: 0, gemini: Number(process.env.GEMINI_GAP_MS ?? 0) };

const RETRYABLE = /\b(429|500|502|503|504|529)\b|UNAVAILABLE|overloaded|rate.?limit|high demand|timed? ?out|fetch failed/i;
class HttpError extends Error {}

async function once(model: Model, system: string, user: string, json: boolean, maxTokens: number): Promise<Omit<CallResult, "retries" | "ms">> {
  if (model.provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: AbortSignal.timeout(120_000), headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: model.id, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(`${r.status} ${j.error?.type}: ${j.error?.message}`);
    return { text: (j.content ?? []).map((c: any) => c.text ?? "").join(""), inTok: j.usage?.input_tokens ?? 0, outTok: j.usage?.output_tokens ?? 0 };
  }
  if (model.provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", signal: AbortSignal.timeout(120_000), headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: model.id, max_completion_tokens: maxTokens + 1000, reasoning_effort: "low", ...(json ? { response_format: { type: "json_object" } } : {}), messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(`${r.status} ${j.error?.type}: ${j.error?.message}`);
    return { text: j.choices?.[0]?.message?.content ?? "", inTok: j.usage?.prompt_tokens ?? 0, outTok: j.usage?.completion_tokens ?? 0 };
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`, { method: "POST", signal: AbortSignal.timeout(120_000), headers: { "content-type": "application/json", "x-goog-api-key": process.env.GOOGLE_GEMINI_API ?? "" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens + 3000, ...(json ? { responseMimeType: "application/json" } : {}) } }) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(`${r.status} ${j.error?.status}: ${j.error?.message}`);
  return { text: (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join(""), inTok: j.usageMetadata?.promptTokenCount ?? 0, outTok: (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0) };
}

/** One model call. Retries overload and rate limits up to three times (2 s, 5 s, 10 s); the time reported is the successful attempt's own. */
export function call(model: Model, system: string, user: string, opts: { json?: boolean; maxTokens?: number } = {}): Promise<CallResult> {
  return gates[model.provider](async () => {
    let retries = 0;
    for (;;) {
      const t = performance.now();
      try {
        const out = await once(model, system, user, opts.json ?? false, opts.maxTokens ?? 3000);
        const done = { ...out, ms: performance.now() - t, retries };
        if (GAP[model.provider]) await new Promise((r) => setTimeout(r, GAP[model.provider]));
        return done;
      } catch (error) {
        const message = String((error as Error).message ?? error).slice(0, 220);
        if (retries < 3 && RETRYABLE.test(message)) {
          await new Promise((r) => setTimeout(r, [4000, 12_000, 30_000][retries]));
          retries += 1;
          continue;
        }
        return { text: "", ms: performance.now() - t, inTok: 0, outTok: 0, retries, error: message };
      }
    }
  });
}

export const extractJson = (text: string): unknown => {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON object in the reply");
  return JSON.parse(text.slice(a, b + 1));
};
