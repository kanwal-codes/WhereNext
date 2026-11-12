import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";

export type ResearchResult = { title: string; url: string; content: string };

export type ResearchOptions = {
  /** Only these sites (a travel guide, a tourism board). Sparse for a small place, so callers fall back to an open search. */
  domains?: string[];
  /** Tavily's own short answer to the question, written from the results. */
  answer?: boolean;
  maxResults?: number;
};

export async function researchDetailed(query: string, signal?: AbortSignal, options: ResearchOptions = {}): Promise<{ results: ResearchResult[]; answer: string | null }> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not configured");
  const response = await guardedFetch("tavily", "https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key, query, search_depth: "basic", max_results: options.maxResults ?? 5,
      include_answer: options.answer ? "basic" : false,
      ...(options.domains?.length ? { include_domains: options.domains } : {}),
    }),
    signal: withProviderTimeout(signal),
  });
  if (!response.ok) throw new Error(`Tavily search failed: ${response.status}`);
  const body = await response.json() as { results?: ResearchResult[]; answer?: unknown };
  return {
    results: (body.results ?? []).filter((result) => result.title && result.url).map((result) => ({ title: result.title, url: result.url, content: result.content?.slice(0, 1200) ?? "" })),
    answer: typeof body.answer === "string" && body.answer.trim() ? body.answer.trim().slice(0, 800) : null,
  };
}

export async function research(query: string, signal?: AbortSignal): Promise<ResearchResult[]> {
  return (await researchDetailed(query, signal)).results;
}
