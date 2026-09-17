import { afterEach, describe, expect, it, vi } from "vitest";

const { gatewayMock } = vi.hoisted(() => ({ gatewayMock: vi.fn((modelId: string) => ({ __modelId: modelId })) }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), gateway: gatewayMock }));

import { composeModelChain } from "@/packages/ai/compose-model";

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_MODEL;
});

describe("composeModelChain", () => {
  it("resolves the compose role's model chain through the Gateway, leading with a writing-quality model", () => {
    const chain = composeModelChain();
    expect(chain[0].modelId).toBe("anthropic/claude-sonnet-5");
    expect(chain.length).toBeGreaterThan(1); // fast/cheap models remain as an outage fallback
    expect(gatewayMock).toHaveBeenCalledWith("anthropic/claude-sonnet-5");
  });

  it("AI_MODEL overrides the lead model", () => {
    process.env.AI_MODEL = "openai/gpt-5";
    expect(composeModelChain()[0].modelId).toBe("openai/gpt-5");
  });
});
