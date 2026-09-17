import { research as tavilyResearch } from "@/packages/providers/tavily/client";
import { research as exaResearch } from "@/packages/providers/exa/client";
import { cached } from "@/lib/server/ttl-cache";
import type { ToolCall } from "../../turn-resolver";
import type { RetrieveContext } from "../context";
import { RESEARCH_CACHE_MS } from "../context";

type ResearchWebCall = Extract<ToolCall, { tool: "research_web" }>;

// Phase 5 (docs/overhaul/roadmap/phase-5-optional-improvements.md) — Exa pilot: a real benchmark
// found it ~37% faster than Tavily on average with an even bigger tail-latency gap (see
// exa/client.ts's doc comment), but content quality wasn't a clear win either way, so this stays
// an opt-in pilot rather than a hard swap — set EXA_API_KEY to try it with real traffic, same
// convention every other optional provider in this app already uses (key present = enabled).
// Whichever provider is actually in use is cache-keyed separately, so switching between them
// mid-rollout can't serve one provider's cached results under the other's name.
export async function handleResearchWeb(call: ResearchWebCall, ctx: RetrieveContext): Promise<void> {
  const useExa = Boolean(process.env.EXA_API_KEY);
  const provider = useExa ? "exa" : "tavily";
  // A repeat or adjacent ask for the same topic (this turn's own retry, a follow-up question,
  // another trip asking about the same city) shouldn't re-hit the provider within this window.
  // Not tied to this call's `signal` — the cached load is shared across callers, so one caller's
  // abort must not cancel it out from under another who's still waiting on the same key.
  const results = await cached(`research-web:${provider}:${call.query.trim().toLowerCase()}`, RESEARCH_CACHE_MS, () =>
    useExa ? exaResearch(call.query) : tavilyResearch(call.query),
  ).catch(ctx.fail(provider));
  if (results) ctx.sources.push(...results.map(({ title, url, content }) => ({ title, url, content })));
}
