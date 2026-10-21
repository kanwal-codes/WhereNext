import { beforeEach, describe, expect, it, vi } from "vitest";

const recordAiTurn = vi.hoisted(() => vi.fn(async () => undefined));
const refreshThreadSummary = vi.hoisted(() => vi.fn(async () => undefined));
const info = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/ai-turn-trace", () => ({ recordAiTurn }));
vi.mock("@/lib/application/thread-summary", () => ({ refreshThreadSummary }));
vi.mock("@/lib/server/logger", () => ({ logger: { info, warn: vi.fn(), error: vi.fn() } }));

import { recordComposedTurn, recordEarlyExitTurn } from "../../lib/server/ai-turn-accounting";

type Any = Record<string, any>;
const supabase = { id: "user-client" } as never;
const traceClient = { id: "trace-client" } as never;
const scope = { supabase, traceClient, tripId: "trip-1", userId: "u1" };
const block = (type: string) => ({ type }) as never;
const early = (over: Any = {}) => ({
  kind: "declined", content: "no", meta: { blocks: [] }, usage: [{ model: "claude-haiku-5-5", promptTokens: 1000, completionTokens: 200 }],
  resolved: { intent: "other", modelUsed: "claude-haiku-5-5", degraded: false }, timings: { resolveMs: 120, retrieveMs: 0 }, ...over,
}) as never;
const ready = (over: Any = {}) => ({
  kind: "ready", system: "x".repeat(400), usage: [{ model: "claude-haiku-5-5", promptTokens: 1000, completionTokens: 200 }],
  resolved: { intent: "food", modelUsed: "claude-haiku-5-5", degraded: false },
  timings: { resolveMs: 100, retrieveMs: 300 },
  toolPlan: [{ tool: "search_places" }, { tool: "weather" }],
  toolEvidence: { usedTools: ["weather", "events"], unavailableProviders: ["events-api", "maps-api"] },
  evidenceUnavailableProviders: ["weather-api", "events-api"],
  meta: { blocks: [block("places")] }, ...over,
}) as never;
const lastTrace = () => (recordAiTurn.mock.calls.at(-1) as unknown as [unknown, string, Any]);

beforeEach(() => { recordAiTurn.mockClear(); refreshThreadSummary.mockClear(); info.mockClear(); delete process.env.RESOLVE_MODEL; delete process.env.AI_MODEL; });

describe("recordEarlyExitTurn", () => {
  const input = (over: Any = {}) => ({ result: early(), prompt: "hello there", finalText: "Sorry, no.", blocks: [] as never[], tools: [], providersFailed: [], totalMs: 900, ...over });

  it("writes the trace with the service-role client, RESOLVE's own usage and timings", () => {
    recordEarlyExitTurn(scope, input({ tools: ["search_places"], providersFailed: ["x"], blocks: [block("clarify")] }));
    const [client, tripId, row] = lastTrace();
    expect(client).toBe(traceClient);
    expect(tripId).toBe("trip-1");
    expect(row).toMatchObject({ intent: "other", tools: ["search_places"], providers_failed: ["x"], blocks: ["clarify"], tokens_in: 1000, tokens_out: 200, resolve_ms: 120, retrieve_ms: 0, total_ms: 900, model_resolve: "claude-haiku-5-5", degraded: false });
    expect(row.cost_usd).toBeCloseTo((1000 / 1e6) * 0.1 + (200 / 1e6) * 0.5, 5);
  });

  it("sums every RESOLVE call when there were several", () => {
    recordEarlyExitTurn(scope, input({ result: early({ usage: [{ model: "claude-haiku-5-5", promptTokens: 10, completionTokens: 1 }, { model: "claude-haiku-5-5", promptTokens: 20, completionTokens: 2 }] }) }));
    expect(lastTrace()[2]).toMatchObject({ tokens_in: 30, tokens_out: 3 });
  });

  it("estimates from the text when RESOLVE reported no usage, under its own model", () => {
    process.env.RESOLVE_MODEL = "resolve-env-model";
    recordEarlyExitTurn(scope, input({ result: early({ usage: [], resolved: { intent: "other", modelUsed: undefined, degraded: true } }), prompt: "a".repeat(40), finalText: "b".repeat(12) }));
    expect(lastTrace()[2]).toMatchObject({ tokens_in: 10, tokens_out: 3, model_resolve: "resolve-env-model", degraded: true });
  });

  it("prices an estimate under the model RESOLVE says it used", () => {
    recordEarlyExitTurn(scope, input({ result: early({ usage: [], resolved: { intent: "other", modelUsed: "claude-opus-5-5", degraded: false } }), prompt: "a".repeat(4_000_000), finalText: "" }));
    expect(lastTrace()[2].cost_usd).toBeCloseTo(4, 3); // 1M estimated tokens at the opus rate (4 $/M in), not the default
  });

  it("never labels a degraded RESOLVE with the compose model", () => {
    process.env.AI_MODEL = "compose-env-model";
    recordEarlyExitTurn(scope, input({ result: early({ usage: [], resolved: { intent: "other", modelUsed: undefined, degraded: true } }) }));
    expect(lastTrace()[2].model_resolve).toBeUndefined();
  });

  it("refreshes the thread summary for the user's own client", () => {
    recordEarlyExitTurn(scope, input());
    expect(refreshThreadSummary).toHaveBeenCalledWith(supabase, "trip-1", "u1");
  });
});

describe("recordComposedTurn", () => {
  const input = (over: Any = {}) => ({ result: ready(), meta: { blocks: [block("places"), block("weather")] } as never, finalText: "y".repeat(80), tokensIn: 500, tokensOut: 90, composedModel: "claude-sonnet-5-5", composeMs: 2200, evaluatorUsage: undefined, totalMs: 4000, ...over });

  it("prices the whole turn: RESOLVE, COMPOSE and the grounding check, each by its own model", () => {
    recordComposedTurn(scope, input({ evaluatorUsage: { model: "claude-haiku-5-5", promptTokens: 300, completionTokens: 30 } }));
    const row = lastTrace()[2];
    expect(row.tokens_in).toBe(1000 + 500 + 300);
    expect(row.tokens_out).toBe(200 + 90 + 30);
    const expected = (1000 / 1e6) * 0.1 + (200 / 1e6) * 0.5 + (500 / 1e6) * 2 + (90 / 1e6) * 10 + (300 / 1e6) * 0.1 + (30 / 1e6) * 0.5;
    expect(row.cost_usd).toBeCloseTo(expected, 5);
  });

  it("leaves the grounding check out when it did not run", () => {
    recordComposedTurn(scope, input());
    expect(lastTrace()[2].tokens_in).toBe(1500);
  });

  it("estimates COMPOSE's tokens from the text when the provider reported none", () => {
    recordComposedTurn(scope, input({ tokensIn: 0, tokensOut: 0, finalText: "z".repeat(80) }));
    expect(lastTrace()[2]).toMatchObject({ tokens_in: 1000 + 100, tokens_out: 200 + 20 }); // system is 400 chars → 100; text is 80 → 20
  });

  it("names the model that really answered, else the configured one", () => {
    recordComposedTurn(scope, input({ composedModel: "claude-opus-5-5" }));
    expect(lastTrace()[2].model_compose).toBe("claude-opus-5-5");
    process.env.AI_MODEL = "claude-sonnet-5-5";
    recordComposedTurn(scope, input({ composedModel: undefined, tokensIn: 1_000_000, tokensOut: 0 }));
    // priced as the configured model (2 $/M in, 10 $/M out for the estimated 20 tokens), not as the default
    expect(lastTrace()[2].cost_usd).toBeCloseTo(2 + (20 / 1e6) * 10 + (1000 / 1e6) * 0.1 + (200 / 1e6) * 0.5, 5);
    expect(lastTrace()[2].model_compose).toBeUndefined();
  });

  it("lists each tool once, from the plan and from what the model called", () => {
    recordComposedTurn(scope, input());
    expect(lastTrace()[2].tools).toEqual(["search_places", "weather", "events"]);
  });

  it("lists each failed provider once, from both retrievals", () => {
    recordComposedTurn(scope, input());
    expect(lastTrace()[2].providers_failed).toEqual(["weather-api", "events-api", "maps-api"]);
  });

  it("records the block types, timings and degraded flag", () => {
    recordComposedTurn(scope, input({ result: ready({ resolved: { intent: "food", modelUsed: "claude-haiku-5-5", degraded: true } }) }));
    expect(lastTrace()[2]).toMatchObject({ intent: "food", blocks: ["places", "weather"], resolve_ms: 100, retrieve_ms: 300, compose_ms: 2200, total_ms: 4000, model_resolve: "claude-haiku-5-5", degraded: true });
    expect(lastTrace()[0]).toBe(traceClient);
  });

  it("logs the turn once, with its cost and latencies", () => {
    recordComposedTurn(scope, input());
    expect(info).toHaveBeenCalledTimes(1);
    const [payload, message] = info.mock.calls[0] as unknown as [{ ai: Any }, string];
    expect(message).toBe("ai turn");
    expect(payload.ai).toMatchObject({ intent: "food", toolPlan: ["search_places", "weather", "events"], latencyMs: { resolve: 100, retrieve: 300, compose: 2200, total: 4000 } });
    expect(payload.ai.costUsd).toBe(lastTrace()[2].cost_usd);
  });

  it("refreshes the thread summary for the user's own client", () => {
    recordComposedTurn(scope, input());
    expect(refreshThreadSummary).toHaveBeenCalledWith(supabase, "trip-1", "u1");
  });
});
