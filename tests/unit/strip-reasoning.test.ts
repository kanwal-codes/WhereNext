import { describe, expect, it } from "vitest";
import { stripReasoning, createReasoningGate } from "../../lib/ai/strip-reasoning";

/** Feed deltas through a gate, concatenating what it lets out. */
function run(deltas: string[]): string {
  const gate = createReasoningGate();
  return deltas.map(gate).join("");
}

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

describe("createReasoningGate (streaming)", () => {
  it("streams a plain model through, delta by delta", () => {
    const gate = createReasoningGate();
    expect(gate("Try ")).toBe("Try ");
    expect(gate("Bar Rouge ")).toBe("Bar Rouge ");
    expect(gate("in Bund.")).toBe("in Bund.");
  });

  it("holds harmony analysis and only releases the final channel", () => {
    const out = run([
      "<|channel|>analysis<|message|>The user wants ",
      "clubs. No hotel yet. ",
      "<|end|><|start|>assistant<|channel|>final<|message|>Try ",
      "Bar Rouge.",
      "<|return|>",
    ]);
    expect(out).toBe("Try Bar Rouge.");
  });

  it("never emits analysis text even across many small deltas", () => {
    const gate = createReasoningGate();
    let leaked = "";
    for (const ch of "<|channel|>analysis<|message|>secret reasoning here".split("")) leaked += gate(ch);
    expect(leaked).toBe("");
  });

  it("holds a <think> block until it closes", () => {
    expect(run(["<think>plan ", "the answer</think>", "The answer is 42."])).toBe("The answer is 42.");
  });

  it("leaves an unclosed <think> mid-sentence alone once real text follows", () => {
    // classified as a tag, block never closes -> nothing emitted (safe: better to hold than leak)
    const gate = createReasoningGate();
    expect(gate("<think> still going")).toBe("");
  });

  it("classifies a leading '<' that turns out to be prose", () => {
    expect(run(["<", "3 nights minimum here."])).toBe("<3 nights minimum here.");
  });
});
