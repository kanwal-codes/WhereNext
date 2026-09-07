import { describe, expect, it } from "vitest";
import { stripUnsupportedReasoningContent } from "@/packages/ai/compose-model";

describe("Cerebras compose requests", () => {
  it("does not echo provider reasoning fields into follow-up tool calls", () => {
    expect(stripUnsupportedReasoningContent({
      messages: [
        { role: "user", content: "find dinner" },
        { role: "assistant", content: null, reasoning_content: "private scratchpad", tool_calls: [{ id: "1" }] },
      ],
    })).toEqual({
      messages: [
        { role: "user", content: "find dinner" },
        { role: "assistant", content: null, tool_calls: [{ id: "1" }] },
      ],
    });
  });
});
