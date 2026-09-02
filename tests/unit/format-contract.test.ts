import { describe, expect, it } from "vitest";
import { assistantSystemPrompt } from "../../packages/contracts/assistant";

// The assistant's behaviour is a contract, not a suggestion. If someone softens
// the system prompt these break.
describe("assistant format contract", () => {
  const prompt = assistantSystemPrompt.toLowerCase();

  it("replies in the user's language", () => {
    expect(prompt).toMatch(/language of the user'?s (latest )?message/);
  });

  it("keeps comparison tables out of the reply", () => {
    expect(prompt).toMatch(/never .*comparison table|never put a .*table/);
  });

  it("requires every trust label", () => {
    for (const label of ["verified", "sourced", "estimated", "assumption", "unavailable"]) {
      expect(prompt).toContain(label);
    }
  });

  it("forbids recommending things the user dislikes", () => {
    expect(prompt).toMatch(/dislike|rejected/);
  });

  it("requires a why-it-fits clause on recommendations", () => {
    expect(prompt).toMatch(/why it fits/);
  });

  it("forbids inventing facts", () => {
    expect(prompt).toMatch(/never (invent|guess)/);
  });

  it("keeps the prompt-injection guard", () => {
    expect(prompt).toMatch(/untrusted/);
    expect(prompt).toMatch(/ignore any instructions/);
  });
});
