import { afterEach, describe, expect, it, vi } from "vitest";

const { anthropicMock } = vi.hoisted(() => ({ anthropicMock: vi.fn((modelId: string) => ({ __modelId: modelId })) }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: anthropicMock }));

import { composeModelChain } from "@/packages/ai/compose-model";

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_MODEL;
});

describe("composeModelChain", () => {
  it("resolves the compose role's model chain on Anthropic, leading with a writing-quality model", () => {
    const chain = composeModelChain();
    expect(chain[0].modelId).toBe("claude-sonnet-5-5");
    expect(chain.length).toBeGreaterThan(1); // a faster model remains as an outage fallback
    expect(anthropicMock).toHaveBeenCalledWith("claude-sonnet-5-5");
  });

  it("AI_MODEL overrides the lead model", () => {
    process.env.AI_MODEL = "claude-opus-5-5";
    expect(composeModelChain()[0].modelId).toBe("claude-opus-5-5");
  });
});
