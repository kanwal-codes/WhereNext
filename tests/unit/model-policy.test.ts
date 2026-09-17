import { afterEach, describe, expect, it, vi } from "vitest";
import { modelChainFor } from "@/packages/ai/model-policy";

const gatewayGenerateStructuredMock = vi.hoisted(() => vi.fn(async () => ({})));
const gatewayStreamStructuredMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/packages/ai/gateway", () => ({ generateStructured: gatewayGenerateStructuredMock, streamStructured: gatewayStreamStructuredMock }));

afterEach(() => {
  delete process.env.RESOLVE_MODEL;
  delete process.env.AI_MODEL;
  delete process.env.SUMMARY_MODEL;
});

const RESOLVE_DEFAULT = [{ id: "openai/gpt-oss-120b", only: ["cerebras"] }, "google/gemini-3.8-flash", "openai/gpt-5-mini", "openai/gpt-4o-mini"];

describe("modelChainFor", () => {
  it("resolve: the default chain when no override is set — Cerebras-pinned lead, unpinned fallbacks", () => {
    expect(modelChainFor("resolve")).toEqual(RESOLVE_DEFAULT);
  });

  it("resolve: RESOLVE_MODEL leads the chain (unpinned), defaults stay as fallback", () => {
    process.env.RESOLVE_MODEL = "openai/gpt-5";
    expect(modelChainFor("resolve")).toEqual(["openai/gpt-5", ...RESOLVE_DEFAULT]);
  });

  it("resolve: a blank RESOLVE_MODEL falls through to the default chain — RESOLVE runs first and gates every turn, so it must never resolve to an empty model id", () => {
    process.env.RESOLVE_MODEL = "";
    expect(modelChainFor("resolve")).toEqual(RESOLVE_DEFAULT);
  });

  it("compose: leads with a writing-quality model, not just the fastest one", () => {
    expect(modelChainFor("compose")[0]).toBe("anthropic/claude-sonnet-5");
  });

  it("compose: AI_MODEL overrides the lead model", () => {
    process.env.AI_MODEL = "anthropic/claude-opus-5";
    expect(modelChainFor("compose")[0]).toBe("anthropic/claude-opus-5");
  });

  it("bulk: SUMMARY_MODEL overrides the lead model", () => {
    process.env.SUMMARY_MODEL = "openai/gpt-5-nano";
    expect(modelChainFor("bulk")[0]).toBe("openai/gpt-5-nano");
  });

  it("an override that's already one of the defaults is not duplicated in the chain", () => {
    process.env.RESOLVE_MODEL = "google/gemini-3.8-flash";
    const chain = modelChainFor("resolve");
    expect(chain.filter((id) => id === "google/gemini-3.8-flash")).toHaveLength(1);
  });

  it("an override matching the pinned entry's bare id dedupes against the object form too, and drops the pin (an env override is always unpinned)", () => {
    process.env.RESOLVE_MODEL = "openai/gpt-oss-120b";
    const chain = modelChainFor("resolve");
    expect(chain[0]).toBe("openai/gpt-oss-120b");
    expect(chain.filter((entry) => typeof entry === "object" && entry.id === "openai/gpt-oss-120b")).toHaveLength(0);
  });
});

describe("generateStructured — RESOLVE prompt caching (Phase 2.4)", () => {
  // Phase 2.6.1 tried routing `resolve` through `streamStructured` instead — live-verified to
  // hang inside this app's actual Next.js route context (see the doc comment on the real
  // `generateStructured` in model-policy.ts), reverted. Every role, `resolve` included, goes
  // through plain `generateStructured`/`generateObject` — the one proven to work live.
  it("requests caching:'auto' for the resolve role", async () => {
    const { generateStructured } = await import("@/packages/ai/model-policy");
    gatewayGenerateStructuredMock.mockClear();
    gatewayStreamStructuredMock.mockClear();
    await generateStructured("resolve", [], { parse: (v: unknown) => v } as never);
    expect(gatewayStreamStructuredMock).not.toHaveBeenCalled();
    expect(gatewayGenerateStructuredMock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), undefined, undefined, { caching: "auto" },
    );
  });

  it("does not request caching for bulk or compose — out of this sub-phase's scope, unmeasured", async () => {
    const { generateStructured } = await import("@/packages/ai/model-policy");
    for (const role of ["bulk", "compose"] as const) {
      gatewayGenerateStructuredMock.mockClear();
      gatewayStreamStructuredMock.mockClear();
      await generateStructured(role, [], { parse: (v: unknown) => v } as never);
      expect(gatewayStreamStructuredMock).not.toHaveBeenCalled();
      expect(gatewayGenerateStructuredMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), undefined, undefined, undefined);
    }
  });
});
