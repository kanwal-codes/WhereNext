import { afterEach, describe, expect, it, vi } from "vitest";
import { modelChainFor } from "@/packages/ai/model-policy";

const llmGenerateStructuredMock = vi.hoisted(() => vi.fn(async () => ({})));
const llmStreamStructuredMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/packages/ai/llm", () => ({ generateStructured: llmGenerateStructuredMock, streamStructured: llmStreamStructuredMock }));

afterEach(() => {
  delete process.env.RESOLVE_MODEL;
  delete process.env.AI_MODEL;
  delete process.env.SUMMARY_MODEL;
});

const RESOLVE_DEFAULT = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"];

describe("modelChainFor", () => {
  it("resolve: the default chain when no override is set — Haiku 5.5 leads, Sonnet 5.5 and Haiku 4.5 follow", () => {
    expect(modelChainFor("resolve")).toEqual(RESOLVE_DEFAULT);
  });

  it("resolve: RESOLVE_MODEL leads the chain, defaults stay as fallback", () => {
    process.env.RESOLVE_MODEL = "claude-opus-5-5";
    expect(modelChainFor("resolve")).toEqual(["claude-opus-5-5", ...RESOLVE_DEFAULT]);
  });

  it("resolve: a blank RESOLVE_MODEL falls through to the default chain — RESOLVE runs first and gates every turn, so it must never resolve to an empty model id", () => {
    process.env.RESOLVE_MODEL = "";
    expect(modelChainFor("resolve")).toEqual(RESOLVE_DEFAULT);
  });

  it("compose: leads with a writing-quality model, not just the fastest one", () => {
    expect(modelChainFor("compose")[0]).toBe("claude-sonnet-5-5");
  });

  it("compose: a stalled lead falls to the faster Haiku 5.5 before the older Sonnet", () => {
    expect(modelChainFor("compose").slice(1)).toEqual(["claude-haiku-5-5", "claude-sonnet-5"]);
  });

  it("every default is an Anthropic model: the app calls Anthropic directly, nothing else is reachable", () => {
    for (const role of ["resolve", "compose", "bulk"] as const) {
      for (const id of modelChainFor(role)) expect(id).toMatch(/^claude-/);
    }
  });

  it("compose: AI_MODEL overrides the lead model", () => {
    process.env.AI_MODEL = "claude-opus-5-5";
    expect(modelChainFor("compose")[0]).toBe("claude-opus-5-5");
  });

  it("bulk: SUMMARY_MODEL overrides the lead model", () => {
    process.env.SUMMARY_MODEL = "claude-sonnet-5-5";
    expect(modelChainFor("bulk")[0]).toBe("claude-sonnet-5-5");
  });

  it("an override that's already one of the defaults is not duplicated in the chain", () => {
    process.env.RESOLVE_MODEL = "claude-sonnet-5-5";
    const chain = modelChainFor("resolve");
    expect(chain.filter((id) => id === "claude-sonnet-5-5")).toHaveLength(1);
    expect(chain[0]).toBe("claude-sonnet-5-5");
  });
});

describe("generateStructured — RESOLVE prompt caching", () => {
  // Phase 2.6.1 tried routing `resolve` through `streamStructured` instead — live-verified to
  // hang inside this app's actual Next.js route context (see the doc comment on the real
  // `generateStructured` in model-policy.ts), reverted. Every role, `resolve` included, goes
  // through plain `generateStructured`/`generateObject` — the one proven to work live.
  it("marks the system prompt cacheable for the resolve role", async () => {
    const { generateStructured } = await import("@/packages/ai/model-policy");
    llmGenerateStructuredMock.mockClear();
    llmStreamStructuredMock.mockClear();
    await generateStructured("resolve", [], { parse: (v: unknown) => v } as never);
    expect(llmStreamStructuredMock).not.toHaveBeenCalled();
    expect(llmGenerateStructuredMock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), undefined, undefined, { caching: "auto" },
    );
  });

  it("does not request caching for bulk or compose — their prompts are not a shared prefix", async () => {
    const { generateStructured } = await import("@/packages/ai/model-policy");
    for (const role of ["bulk", "compose"] as const) {
      llmGenerateStructuredMock.mockClear();
      llmStreamStructuredMock.mockClear();
      await generateStructured(role, [], { parse: (v: unknown) => v } as never);
      expect(llmStreamStructuredMock).not.toHaveBeenCalled();
      expect(llmGenerateStructuredMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), undefined, undefined, undefined);
    }
  });
});
