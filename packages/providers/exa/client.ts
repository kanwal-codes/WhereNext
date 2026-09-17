import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";
import type { ResearchResult } from "../tavily/client";

/**
 * Phase 5 (docs/overhaul/roadmap/phase-5-optional-improvements.md) — a pilot alternative to
 * Tavily for `research_web`, per docs/overhaul/chatbot-overhaul/data-providers.md: an independent
 * December 2025 benchmark found Exa averaging 1.18s vs Tavily's 1.885s (~37% faster), with an
 * even larger gap at p90/p99 — the tail that actually bounds RETRIEVE's total time, since it's
 * gated by its slowest call. Not a clear content-quality upgrade, just a speed trade — see
 * `handleResearchWeb` for how this is gated behind `EXA_API_KEY` rather than replacing Tavily
 * outright, so it can be piloted with real traffic before either provider is removed.
 *
 * Same `ResearchResult` shape and fail-open contract (throws on a missing key or a bad response;
 * the caller's `.catch(ctx.fail("exa"))` handles it) as `tavily/client.ts`, so `research_web`'s
 * handler doesn't need to know which provider actually answered.
 */
export async function research(query: string, signal?: AbortSignal): Promise<ResearchResult[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("EXA_API_KEY is not configured");
  const response = await guardedFetch("exa", "https://api.exa.ai/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    // type: "auto" lets Exa pick neural vs keyword search per query — their own recommended
    // default, not a speed/quality knob worth hand-tuning without real traffic to measure against.
    body: JSON.stringify({ query, type: "auto", numResults: 5, contents: { text: { maxCharacters: 1200 } } }),
    signal: withProviderTimeout(signal),
  });
  if (!response.ok) throw new Error(`Exa search failed: ${response.status}`);
  const body = (await response.json()) as { results?: Array<{ title?: string; url?: string; text?: string }> };
  return (body.results ?? [])
    .filter((result): result is { title: string; url: string; text?: string } => Boolean(result.title && result.url))
    .map((result) => ({ title: result.title, url: result.url, content: result.text?.slice(0, 1200) ?? "" }));
}
