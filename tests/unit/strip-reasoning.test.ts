import { describe, expect, it } from "vitest";
import { stripReasoning } from "../../lib/ai/strip-reasoning";

describe("stripReasoning", () => {
  it("leaves ordinary prose untouched", () => {
    const s = "Here are three neighbourhoods to consider. The Old Port is walkable and central.";
    expect(stripReasoning(s)).toBe(s);
  });

  it("keeps only the harmony final channel", () => {
    const raw =
      "<|channel|>analysis<|message|>The user asked about concerts. They haven't picked a hotel. We should ask first.<|end|>" +
      "<|start|>assistant<|channel|>final<|message|>Which hotel would you like to stay at?<|return|>";
    expect(stripReasoning(raw)).toBe("Which hotel would you like to stay at?");
  });

  it("strips leftover control tokens even without a final marker", () => {
    expect(stripReasoning("<|start|>Answer here<|end|>")).toBe("Answer here");
  });

  it("removes a closed <think> block", () => {
    expect(stripReasoning("<think>plan the response</think>\n\nThe answer is 42.")).toBe("The answer is 42.");
  });

  it("does not touch an unclosed <think> (could be legitimate text)", () => {
    expect(stripReasoning("comparing <think> vs <feel>")).toBe("comparing <think> vs <feel>");
  });

  it("takes the last final channel when several are present", () => {
    const raw =
      "<|channel|>final<|message|>draft one<|end|>" +
      "<|channel|>analysis<|message|>revise<|end|>" +
      "<|channel|>final<|message|>the real answer<|return|>";
    expect(stripReasoning(raw)).toBe("the real answer");
  });
});
