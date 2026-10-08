import { cosineSimilarity } from "ai";

/**
 * Batch text embeddings. Anthropic has no embeddings API, so this uses OpenAI's directly when `OPENAI_API_KEY`
 * is set; without one it throws, and every caller already treats that as "embeddings unavailable"
 * (recommendations keep their keyword vibes and their own order). `EMBED_MODEL` overrides the model;
 * default is `text-embedding-3-small`, 1536d.
 *
 * ponytail: no persistent vector store. Callers embed on the fly and lean on `cached()`
 * for the results. Add a pgvector cache table only if detail-page traffic makes the
 * per-request embed call a measurable cost.
 */
export async function embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  if (texts.length === 0) return [];
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("embeddings unavailable: OPENAI_API_KEY is not set");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: (process.env.EMBED_MODEL || "text-embedding-3-small").replace(/^openai\//, ""), input: texts }),
    signal: signal ?? AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`embeddings request failed: ${response.status}`);
  const body = (await response.json()) as { data?: Array<{ index: number; embedding: number[] }> };
  const embeddings = (body.data ?? []).sort((a, b) => a.index - b.index).map((d) => d.embedding);
  if (embeddings.length !== texts.length) throw new Error("embeddings response length mismatch");
  return embeddings;
}

/** Cosine similarity of two vectors, in [-1, 1]. The SDK's own `cosineSimilarity` throws on a
 *  length mismatch (a real embedding pair never has one, but a caller feeding pathological/fuzz
 *  input still must not crash the whole scoring pass over it) — treat that one case as "no
 *  meaningful similarity" instead of propagating the throw, matching every other "never throws"
 *  guarantee this recommendation pipeline makes elsewhere. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  return cosineSimilarity(a, b);
}
