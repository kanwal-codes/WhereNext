import { withProviderTimeout } from "../request-signal";

export type ResearchResult = { title: string; url: string; content: string };

export async function research(query: string, signal?: AbortSignal): Promise<ResearchResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not configured");
  const response = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ api_key: key, query, search_depth: "basic", max_results: 5, include_answer: false }), signal: withProviderTimeout(signal) });
  if (!response.ok) throw new Error(`Tavily search failed: ${response.status}`);
  const body = await response.json() as { results?: ResearchResult[] };
  return (body.results ?? []).filter((result) => result.title && result.url).map((result) => ({ title: result.title, url: result.url, content: result.content?.slice(0, 1200) ?? "" }));
}
