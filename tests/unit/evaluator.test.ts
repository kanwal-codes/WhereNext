import { afterEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateObject: generateObjectMock }));

import { evaluateGrounding, finalizeAssistantText, hasUnsupportedClaim } from "../../lib/application/evaluator";

afterEach(() => {
  vi.restoreAllMocks();
});

const stubModel = (content: unknown) => {
  generateObjectMock.mockImplementation(async ({ schema }: { schema: { parse: (v: unknown) => unknown } }) => ({
    object: schema.parse(typeof content === "string" ? JSON.parse(content) : content),
    usage: { inputTokens: 10, outputTokens: 10 },
  }));
};

describe("evaluateGrounding", () => {
  it("passes evidence and the draft through to the model call", async () => {
    stubModel({ unsupportedClaims: [] });
    await evaluateGrounding("The hotel costs $200/night.", "Evidence: the hotel costs $150/night.");
    const call = generateObjectMock.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(call.messages[1].content).toContain("$200/night");
    expect(call.messages[1].content).toContain("$150/night");
  });

  it("returns the flagged claims verbatim", async () => {
    stubModel({ unsupportedClaims: ["The hotel costs $200/night."] });
    const result = await evaluateGrounding("The hotel costs $200/night.", "Evidence: the hotel costs $150/night.");
    expect(result.unsupportedClaims).toEqual(["The hotel costs $200/night."]);
  });

  it("returns an empty list for a fully grounded draft", async () => {
    stubModel({ unsupportedClaims: [] });
    const result = await evaluateGrounding("The hotel costs $150/night.", "Evidence: the hotel costs $150/night.");
    expect(result.unsupportedClaims).toEqual([]);
  });

  it("fails open (empty list, never throws) when the model call errors", async () => {
    generateObjectMock.mockRejectedValue(new Error("provider down"));
    await expect(evaluateGrounding("anything", "evidence")).resolves.toEqual({ unsupportedClaims: [] });
  });

  it("fails open on an unparseable response", async () => {
    stubModel("not json");
    await expect(evaluateGrounding("anything", "evidence")).resolves.toEqual({ unsupportedClaims: [] });
  });
});

describe("hasUnsupportedClaim", () => {
  // Phase 3.2.1 was retired after three separate live grammar bugs from in-place text
  // substitution (a dropped article, a dropped preposition, a dropped linking verb — each a
  // different way a bare string-replace can't grammar-proof an arbitrary sentence). The reply is
  // never rewritten anymore; this just decides whether to raise the separate `unverified` flag.
  it("is true when a flagged claim appears verbatim in the content", () => {
    expect(hasUnsupportedClaim("Hotel Belle Vue is in Montmartre.", ["is in Montmartre"])).toBe(true);
  });

  it("is true when at least one of several flagged claims matches, even if others don't", () => {
    expect(hasUnsupportedClaim("Open Mondays, rated 4.9 stars.", ["Open Mondays", "a claim that was misquoted"])).toBe(true);
  });

  it("is false when no flagged claim is found verbatim (the model misquoted, or hallucinated a claim that isn't there)", () => {
    expect(hasUnsupportedClaim("Open Mondays, rated 4.9 stars.", ["misquoted one", "misquoted two"])).toBe(false);
  });

  it("is false for an empty claims list", () => {
    expect(hasUnsupportedClaim("Nothing flagged here.", [])).toBe(false);
  });
});

describe("finalizeAssistantText", () => {
  it("runs the regex sanitizer, and reports (but never rewrites) an evaluator-flagged claim", async () => {
    stubModel({ unsupportedClaims: ["a rooftop bar"] });
    const onUnverified = vi.fn();
    const result = await finalizeAssistantText("Try the $500 rooftop bar, a rooftop bar with a view.", new Set(), "Evidence: nothing about a rooftop bar.", undefined, undefined, undefined, onUnverified);
    expect(result).toContain("an amount I can't verify here"); // regex sanitizer's own money replacement
    expect(result).toContain("a rooftop bar"); // evaluator's flag is reported, never edited into the text
    expect(onUnverified).toHaveBeenCalledTimes(1);
  });

  it("does not call onUnverified when the evaluator flags nothing", async () => {
    stubModel({ unsupportedClaims: [] });
    const onUnverified = vi.fn();
    await finalizeAssistantText("Try the rooftop bar.", new Set(), "Evidence: the rooftop bar is well reviewed.", undefined, undefined, undefined, onUnverified);
    expect(onUnverified).not.toHaveBeenCalled();
  });

  it("does not call onUnverified when the flagged claim doesn't actually appear in the text (a misquote)", async () => {
    stubModel({ unsupportedClaims: ["a claim that isn't in the draft"] });
    const onUnverified = vi.fn();
    const result = await finalizeAssistantText("Try the rooftop bar.", new Set(), "Evidence: nothing about a rooftop bar.", undefined, undefined, undefined, onUnverified);
    expect(result).toBe("Try the rooftop bar.");
    expect(onUnverified).not.toHaveBeenCalled();
  });

  it("falls back to the sanitized (un-evaluated) text when the evaluator call never resolves in time", async () => {
    generateObjectMock.mockImplementation(() => new Promise(() => undefined)); // hangs forever
    const t0 = performance.now();
    const onUnverified = vi.fn();
    const result = await finalizeAssistantText("Hotel Belle Vue is in Montmartre.", new Set(), "Evidence: Hotel Belle Vue is in Le Marais.", undefined, undefined, undefined, onUnverified);
    // Bounded by AI_DEADLINE_MS.groundingEvaluator (2.5s) — well under the hung call's "forever".
    expect(performance.now() - t0).toBeLessThan(3_000);
    // The regex sanitizer still ran (this draft has no money in it, so it's a no-op either way);
    // the evaluator's claims never arrived in time, so no flag is raised either.
    expect(result).toBe("Hotel Belle Vue is in Montmartre.");
    expect(onUnverified).not.toHaveBeenCalled();
  }, 10_000);

  // Phase 3.2.2 mitigation (a) (docs/overhaul/roadmap/phase-3-accuracy.md): chitchat and
  // trip_memory turns skip the real model round-trip entirely — neither can contain a fabricated
  // business claim by construction, so the latency isn't worth paying.
  it("skips the evaluator model call entirely for chitchat and trip_memory intents", async () => {
    stubModel({ unsupportedClaims: ["a rooftop bar"] }); // would flag it, if called
    for (const intent of ["chitchat", "trip_memory"]) {
      generateObjectMock.mockClear();
      const result = await finalizeAssistantText("Try the rooftop bar.", new Set(), "Evidence: nothing about a rooftop bar.", undefined, undefined, intent);
      expect(generateObjectMock).not.toHaveBeenCalled();
      expect(result).toBe("Try the rooftop bar."); // unflagged — the evaluator never ran
    }
  });

  it("still evaluates every other intent, and when no intent is given at all", async () => {
    stubModel({ unsupportedClaims: [] });
    for (const intent of ["discovery", "nightlife", "food", "stays", undefined]) {
      generateObjectMock.mockClear();
      await finalizeAssistantText("Try the rooftop bar.", new Set(), "Evidence: nothing about a rooftop bar.", undefined, undefined, intent);
      expect(generateObjectMock).toHaveBeenCalledTimes(1);
    }
  });

  it("the regex sanitizer still runs even for a skipped-evaluator intent", async () => {
    const result = await finalizeAssistantText("It costs $500 for the tour.", new Set(), "Evidence: nothing about a tour.", undefined, undefined, "chitchat");
    expect(result).toContain("an amount I can't verify here");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });
});
