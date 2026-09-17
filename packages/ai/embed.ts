import { embedMany, cosineSimilarity, gateway } from "ai";

/**
 * Batch text embeddings through Vercel AI Gateway. `EMBED_MODEL` overrides the model (as a
 * Gateway id, e.g. "openai/text-embedding-3-large"); default is `text-embedding-3-small`, 1536d.
 *
 * ponytail: no persistent vector store. Callers embed on the fly and lean on `cached()`
 * for the results. Add a pgvector cache table only if detail-page traffic makes the
 * per-request embed call a measurable cost.
 */
export async function embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    model: gateway.embedding(process.env.EMBED_MODEL || "openai/text-embedding-3-small"),
    values: texts,
    abortSignal: signal ?? AbortSignal.timeout(8_000),
  });
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
