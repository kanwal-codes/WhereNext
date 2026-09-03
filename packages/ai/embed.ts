import { resolveProvider } from "./gateway";

/**
 * Batch text embeddings via an OpenAI-compatible `/v1/embeddings` endpoint, using the
 * OpenAI provider credentials (`AI_API_KEY` / `OPENAI_API_KEY`). One HTTP call for the
 * whole array. `EMBED_MODEL` overrides the model (default `text-embedding-3-small`, 1536d).
 *
 * ponytail: no persistent vector store. Callers embed on the fly and lean on `cached()`
 * for the results. Add a pgvector cache table only if detail-page traffic makes the
 * per-request embed call a measurable cost.
 */
export async function embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { apiKey, baseUrl } = resolveProvider({ provider: "openai" });
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.EMBED_MODEL || "text-embedding-3-small", input: texts }),
    signal: signal ?? AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`embeddings request failed: ${response.status}`);
  const body = (await response.json()) as { data?: Array<{ embedding: number[] }> };
  const out = (body.data ?? []).map((d) => d.embedding);
  if (out.length !== texts.length) throw new Error("embeddings response length mismatch");
  return out;
}

/** Cosine similarity of two equal-length vectors, in [-1, 1]. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
