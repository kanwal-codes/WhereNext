import { afterEach, describe, expect, it } from "vitest";
import { composedTrace, earlyExitTrace } from "../../features/group-chat/application/roamTurnTrace";

type Any = Record<string, any>;
const early = (over: Any = {}) => ({
  kind: "declined", content: "x".repeat(12), meta: { blocks: [{ type: "clarify" }] },
  usage: [{ model: "claude-haiku-5-5", promptTokens: 1000, completionTokens: 200 }],
  resolved: { intent: "other", modelUsed: "claude-haiku-5-5", degraded: false }, timings: { resolveMs: 120, retrieveMs: 5 }, ...over,
}) as never;
const ready = (over: Any = {}) => ({
  kind: "ready", system: "s".repeat(400), usage: [{ model: "claude-haiku-5-5", promptTokens: 1000, completionTokens: 200 }],
  resolved: { intent: "food", modelUsed: "claude-haiku-5-5", degraded: false }, timings: { resolveMs: 100, retrieveMs: 300 },
  toolPlan: [{ tool: "search_places" }, { tool: "weather" }],
  toolEvidence: { usedTools: ["weather", "events"], unavailableProviders: ["events-api", "maps-api"] },
  evidenceUnavailableProviders: ["weather-api", "events-api"], meta: { blocks: [] }, ...over,
}) as never;
const input = (over: Any = {}) => ({ meta: { blocks: [{ type: "places" }, { type: "weather" }] } as never, sanitized: "y".repeat(80), composedModel: "claude-sonnet-5-5", composeUsage: { inputTokens: 500, outputTokens: 90 }, evaluatorUsage: undefined, composeMs: 2200, totalMs: 4000, ...over });

afterEach(() => { delete process.env.RESOLVE_MODEL; delete process.env.AI_MODEL; });

describe("earlyExitTrace", () => {
  it("records RESOLVE's usage, timings and the blocks, with no compose time", () => {
    const row = earlyExitTrace(early(), "hello", 900);
    expect(row).toMatchObject({ intent: "other", tools: [], providers_failed: [], blocks: ["clarify"], tokens_in: 1000, tokens_out: 200, resolve_ms: 120, retrieve_ms: 5, compose_ms: 0, total_ms: 900, model_resolve: "claude-haiku-5-5", degraded: false });
    expect(row.cost_usd).toBeCloseTo((1000 / 1e6) * 0.1 + (200 / 1e6) * 0.5, 5);
  });

  it("names the tools tried and the providers that failed when the reply was ungrounded", () => {
    const row = earlyExitTrace(early({ kind: "ungrounded", toolsUsed: ["search_places"], providersFailed: ["places-api"] }), "hello", 1);
    expect(row.tools).toEqual(["search_places"]);
    expect(row.providers_failed).toEqual(["places-api"]);
  });

  it("estimates from the text when RESOLVE reported no usage", () => {
    process.env.RESOLVE_MODEL = "env-model";
    const row = earlyExitTrace(early({ usage: [], resolved: { intent: "other", modelUsed: undefined, degraded: true } }), "a".repeat(40), 1);
    expect(row).toMatchObject({ tokens_in: 10, tokens_out: 3, model_resolve: "env-model", degraded: true });
  });

  it("prices that estimate under the model RESOLVE says it used", () => {
    const row = earlyExitTrace(early({ usage: [], content: "", resolved: { intent: "other", modelUsed: "claude-opus-5-5", degraded: false } }), "a".repeat(4_000_000), 1);
    expect(row.cost_usd).toBeCloseTo(4, 3);
  });
});

describe("composedTrace", () => {
  it("prices RESOLVE, COMPOSE and the grounding check, each by its own model", () => {
    const row = composedTrace(ready(), input({ evaluatorUsage: { model: "claude-haiku-5-5", promptTokens: 300, completionTokens: 30 } }));
    expect(row.tokens_in).toBe(1000 + 500 + 300);
    expect(row.tokens_out).toBe(200 + 90 + 30);
    expect(row.cost_usd).toBeCloseTo((1000 / 1e6) * 0.1 + (200 / 1e6) * 0.5 + (500 / 1e6) * 2 + (90 / 1e6) * 10 + (300 / 1e6) * 0.1 + (30 / 1e6) * 0.5, 5);
  });

  it("leaves the grounding check out when it did not run", () => {
    expect(composedTrace(ready(), input()).tokens_in).toBe(1500);
  });

  it("counts a missing figure in COMPOSE's usage as zero", () => {
    const noOut = composedTrace(ready(), input({ composeUsage: { inputTokens: 500 } }));
    expect(noOut.tokens_in).toBe(1500);
    expect(noOut.tokens_out).toBe(200);
    const noIn = composedTrace(ready(), input({ composeUsage: { outputTokens: 90 } }));
    expect(noIn.tokens_in).toBe(1000);
    expect(noIn.tokens_out).toBe(290);
  });

  it("estimates COMPOSE from the prompt and reply when the provider reported nothing", () => {
    const row = composedTrace(ready(), input({ composeUsage: undefined }));
    expect(row.tokens_in).toBe(1000 + 100); // 400-char system
    expect(row.tokens_out).toBe(200 + 20); // 80-char reply
  });

  it("prices that estimate under the model that composed, else the configured one", () => {
    process.env.AI_MODEL = "claude-opus-5-5";
    const withModel = composedTrace(ready({ usage: [] }), input({ composeUsage: undefined, composedModel: "claude-haiku-5-5", sanitized: "z".repeat(4_000_000) }));
    const fallback = composedTrace(ready({ usage: [] }), input({ composeUsage: undefined, composedModel: undefined, sanitized: "z".repeat(4_000_000) }));
    expect(withModel.cost_usd).toBeLessThan(fallback.cost_usd);
    expect(fallback.cost_usd).toBeGreaterThan(20); // opus out-rate on 1M tokens
  });

  it("lists each tool and failed provider once", () => {
    const row = composedTrace(ready(), input());
    expect(row.tools).toEqual(["search_places", "weather", "events"]);
    expect(row.providers_failed).toEqual(["weather-api", "events-api", "maps-api"]);
  });

  it("records the blocks, timings, models and degraded flag", () => {
    const row = composedTrace(ready({ resolved: { intent: "food", modelUsed: "claude-haiku-5-5", degraded: true } }), input());
    expect(row).toMatchObject({ intent: "food", blocks: ["places", "weather"], resolve_ms: 100, retrieve_ms: 300, compose_ms: 2200, total_ms: 4000, model_resolve: "claude-haiku-5-5", model_compose: "claude-sonnet-5-5", degraded: true });
  });
});
