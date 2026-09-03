import type { AiMessage } from "@/packages/ai/gateway";
import { withProviderTimeout } from "../../providers/request-signal";

type ProviderConfig = { apiKey: string; baseUrl: string; model: string; supportsReasoningOptions?: boolean };

/** Token counts for one call, reported via the optional `onUsage` callback. */
export type TokenUsage = { promptTokens: number; completionTokens: number };
const readUsage = (u: unknown): TokenUsage | undefined => {
  const usage = u as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  return typeof usage?.prompt_tokens === "number"
    ? { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens ?? 0 }
    : undefined;
};

function waitForRetry(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new DOMException("Aborted", "AbortError")); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason ?? new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

export class OpenAiCompatibleProvider {
  constructor(private readonly config: ProviderConfig) {}
  private headers() { return { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" }; }
  private options() { return { max_completion_tokens: 1600, ...(this.config.supportsReasoningOptions ? { reasoning_effort: "low", reasoning_format: "hidden" } : {}) }; }

  /** One POST to /chat/completions with a single retry on 429/5xx. Returns the OK response. */
  private async post(payload: Record<string, unknown>, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ model: this.config.model, ...this.options(), ...payload }),
        signal: withProviderTimeout(signal, timeoutMs),
      });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      const retryDelay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : Math.min(500 * (2 ** attempt), 10_000);
      if (attempt < 1) await waitForRetry(retryDelay, signal);
    }
    const error = new Error(`AI provider request failed: ${response?.status ?? "network"}`) as Error & { status?: number };
    error.status = response?.status;
    throw error;
  }

  async generateText(messages: AiMessage[], signal?: AbortSignal, onUsage?: (u: TokenUsage) => void) {
    const response = await this.post({ messages }, 6_000, signal);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
    const usage = readUsage(body.usage);
    if (usage) onUsage?.(usage);
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("AI provider returned an empty response");
    return text;
  }

  /** Ask for a single JSON object. Returns the parsed value; the caller validates it against a schema. */
  async generateStructured(messages: AiMessage[], signal?: AbortSignal, onUsage?: (u: TokenUsage) => void): Promise<unknown> {
    const response = await this.post({ messages, response_format: { type: "json_object" } }, 8_000, signal);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
    const usage = readUsage(body.usage);
    if (usage) onUsage?.(usage);
    const raw = body.choices?.[0]?.message?.content ?? "";
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("AI provider returned no JSON object");
    return JSON.parse(json) as unknown;
  }

  async stream(messages: AiMessage[], signal?: AbortSignal, onUsage?: (u: TokenUsage) => void) {
    // `include_usage` makes OpenAI emit a trailing usage-only chunk; Cerebras ignores it harmlessly.
    const response = await this.post({ messages, stream: true, stream_options: { include_usage: true } }, 12_000, signal);
    if (!response.body) {
      const error = new Error("AI streaming response had no body") as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    if (!onUsage) return response.body;
    // Tee the SSE through unchanged; sniff `data:` lines for the usage block.
    let buffer = "";
    const sniff = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        buffer += new TextDecoder().decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
          try {
            const usage = readUsage((JSON.parse(line.slice(5).trim()) as { usage?: unknown }).usage);
            if (usage) onUsage(usage);
          } catch {
            /* partial frame */
          }
        }
      },
    });
    return response.body.pipeThrough(sniff);
  }
}
