import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveProviderChain, createGatewayWithFallback } from "../../packages/ai/gateway";

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ["AI_PROVIDER", "AI_FALLBACK_PROVIDERS", "AI_API_KEY", "OPENAI_API_KEY", "CEREBRAS_API_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "AI_MODEL", "AI_BASE_URL"]) delete process.env[k];
});

describe("resolveProviderChain", () => {
  it("is primary then AI_FALLBACK_PROVIDERS, each pinned to its own endpoint", () => {
    process.env.AI_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk";
    process.env.AI_FALLBACK_PROVIDERS = "gemini, openai";
    process.env.GEMINI_API_KEY = "gk";
    process.env.GEMINI_MODEL = "gemini-3.6-flash"; // gemini fallback needs an explicit live model
    process.env.OPENAI_API_KEY = "ok";
    const chain = resolveProviderChain();
    expect(chain.map((p) => p.baseUrl)).toEqual([
      "https://api.cerebras.ai/v1",
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "https://api.openai.com/v1",
    ]);
    expect(chain[0].model).toBe("gpt-oss-120b");
    expect(chain[1].model).toBe("gemini-3.6-flash");
  });

  it("skips a gemini fallback when no live GEMINI_MODEL is pinned (its default ids lapse)", () => {
    process.env.AI_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk";
    process.env.AI_FALLBACK_PROVIDERS = "gemini, openai";
    process.env.GEMINI_API_KEY = "gk"; // key present, but no GEMINI_MODEL
    process.env.OPENAI_API_KEY = "ok";
    const chain = resolveProviderChain();
    expect(chain.map((p) => p.baseUrl)).toEqual(["https://api.cerebras.ai/v1", "https://api.openai.com/v1"]);
  });

  it("drops fallbacks that have no key, keeps the ones that do", () => {
    process.env.AI_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk";
    process.env.AI_FALLBACK_PROVIDERS = "gemini,openai";
    process.env.OPENAI_API_KEY = "ok"; // no GEMINI_API_KEY
    const chain = resolveProviderChain();
    expect(chain.map((p) => p.baseUrl)).toEqual(["https://api.cerebras.ai/v1", "https://api.openai.com/v1"]);
  });

  it("throws the primary's env hint when nothing is configured", () => {
    process.env.AI_PROVIDER = "cerebras";
    expect(() => resolveProviderChain()).toThrow(/CEREBRAS_API_KEY/);
  });

  it("de-duplicates a provider that appears as both primary and fallback", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "ok";
    process.env.AI_FALLBACK_PROVIDERS = "openai, cerebras";
    process.env.CEREBRAS_API_KEY = "csk";
    const chain = resolveProviderChain();
    expect(chain.map((p) => p.baseUrl)).toEqual(["https://api.openai.com/v1", "https://api.cerebras.ai/v1"]);
  });

  it("the primary honours AI_MODEL / AI_BASE_URL; fallbacks stay pinned to their own", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "ok";
    process.env.AI_MODEL = "gpt-4o-mini";
    process.env.AI_BASE_URL = "https://proxy.example/v1";
    process.env.AI_FALLBACK_PROVIDERS = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk";
    const [primary, fallback] = resolveProviderChain();
    expect(primary).toMatchObject({ baseUrl: "https://proxy.example/v1", model: "gpt-4o-mini" });
    expect(fallback).toMatchObject({ baseUrl: "https://api.cerebras.ai/v1", model: "gpt-oss-120b" });
  });
});

describe("createGatewayWithFallback", () => {
  it("falls over to the next provider on a 5xx and returns its result", async () => {
    process.env.AI_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk";
    process.env.AI_FALLBACK_PROVIDERS = "openai";
    process.env.OPENAI_API_KEY = "ok";
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      url.includes("cerebras")
        ? Promise.resolve(new Response("upstream boom", { status: 503 }))
        : Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "from openai" } }] }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    const text = await createGatewayWithFallback().generateText([{ role: "user", content: "hi" }]);
    expect(text).toBe("from openai");
    // cerebras tried (twice — its own retry), then openai.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("cerebras"))).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("openai.com"))).toBe(true);
  });

  it("does not fall over on a 400 (another provider can't fix a bad request)", async () => {
    process.env.AI_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk";
    process.env.AI_FALLBACK_PROVIDERS = "openai";
    process.env.OPENAI_API_KEY = "ok";
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createGatewayWithFallback().generateText([{ role: "user", content: "hi" }])).rejects.toThrow();
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes("cerebras"))).toBe(true);
  });

  it("DOES fall over on a 401 (a stale key is a per-provider problem)", async () => {
    process.env.AI_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk";
    process.env.AI_FALLBACK_PROVIDERS = "openai";
    process.env.OPENAI_API_KEY = "ok";
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(String(url).includes("cerebras")
        ? new Response("unauthorized", { status: 401 })
        : new Response(JSON.stringify({ choices: [{ message: { content: "openai" } }] }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await createGatewayWithFallback().generateText([{ role: "user", content: "hi" }])).toBe("openai");
  });

  it("fails over on generateStructured and returns the next provider's JSON", async () => {
    process.env.AI_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk";
    process.env.AI_FALLBACK_PROVIDERS = "openai";
    process.env.OPENAI_API_KEY = "ok";
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(String(url).includes("cerebras")
        ? new Response("boom", { status: 502 })
        : new Response(JSON.stringify({ choices: [{ message: { content: '{"intent":"food"}' } }] }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await createGatewayWithFallback().generateStructured([{ role: "user", content: "x" }])).toEqual({ intent: "food" });
  });

  it("fails over on stream() and returns the next provider's stream", async () => {
    process.env.AI_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk";
    process.env.AI_FALLBACK_PROVIDERS = "openai";
    process.env.OPENAI_API_KEY = "ok";
    const good = new Response('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n', {
      status: 200, headers: { "content-type": "text/event-stream" },
    });
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(String(url).includes("cerebras") ? new Response("boom", { status: 500 }) : good));
    vi.stubGlobal("fetch", fetchMock);
    const body = await createGatewayWithFallback().stream([{ role: "user", content: "x" }]);
    expect(await new Response(body).text()).toContain('"content":"hi"');
  });

  it("does not retry another provider on an AbortError", async () => {
    process.env.AI_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk";
    process.env.AI_FALLBACK_PROVIDERS = "openai";
    process.env.OPENAI_API_KEY = "ok";
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createGatewayWithFallback().generateText([{ role: "user", content: "x" }])).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes("cerebras"))).toBe(true);
  });
});
