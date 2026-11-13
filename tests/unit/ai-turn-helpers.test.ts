import { describe, expect, it } from "vitest";
import { lastSuggestedFollowups, modelHistory, surfacedEarlierFrom } from "../../lib/application/orchestrate/thread-history";
import { SSE_HEADERS, doneFrame, isAbortError, buildStep, progressFrame, textFrame, toolSteps, truncatedFrame } from "../../lib/server/ai-stream-frames";

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe("SSE frames", () => {
  it("frames text the way the client reads it", () => {
    expect(text(textFrame("Hi"))).toBe('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n');
    expect(text(doneFrame)).toBe("data: [DONE]\n\n");
    expect(text(truncatedFrame())).toBe('data: {"truncated":true}\n\n');
  });
  it("frames progress, with the label only when there is one", () => {
    expect(text(progressFrame("resolve"))).toBe('data: {"progress":"resolve"}\n\n');
    expect(text(progressFrame("retrieve", "finding places"))).toBe('data: {"progress":"retrieve","label":"finding places"}\n\n');
  });
  it("streams uncached", () => {
    expect(SSE_HEADERS).toMatchObject({ "content-type": "text/event-stream", "x-accel-buffering": "no" });
  });
});

describe("toolSteps", () => {
  it("names each kind of look-up with its place or route", () => {
    expect(toolSteps([
      { tool: "search_places", location: "Ibiza, Spain" },
      { tool: "events", location: "Ibiza, Spain" },
      { tool: "flights", origin: "Toronto, Canada", destination: "Ibiza, Spain" },
      { tool: "directions", from: "Madrid", to: "Lisbon" },
    ])).toEqual(["finding places in Ibiza", "seeing what's on in Ibiza", "comparing flights Toronto to Ibiza", "plotting the route Madrid to Lisbon"]);
  });
  it("says one line per kind, at most four, and nothing for tools it cannot name", () => {
    expect(toolSteps([{ tool: "search_places", location: "Rome" }, { tool: "search_places", location: "Rome" }])).toEqual(["finding places in Rome"]);
    expect(toolSteps([{ tool: "weather" }, { tool: "stays" }, { tool: "research_web" }, { tool: "events" }, { tool: "flights" }])).toHaveLength(4);
    expect(toolSteps([{ tool: "mystery" }])).toEqual([]);
    expect(toolSteps([{ tool: "flights" }])).toEqual(["comparing flights"]);
  });
});

describe("buildStep", () => {
  it("names what is being built, and nothing for an answer that is only written", () => {
    expect(buildStep(["itinerary", "budget"])).toBe("planning your days");
    expect(buildStep(["budget"])).toBe("working out the costs");
    expect(buildStep(["comparison"])).toBe("weighing the options");
    expect(buildStep(["structured_answer"])).toBeUndefined();
  });
});

describe("isAbortError", () => {
  it("recognises both kinds of abort", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});

describe("modelHistory", () => {
  const msg = (role: string, content: string, metadata?: unknown) => ({ role, content, metadata });
  it("keeps only user and assistant turns, each cut to 8,000 characters", () => {
    const out = modelHistory([msg("system", "s"), msg("user", "u".repeat(9000)), msg("assistant", "a")]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(out[0].content).toHaveLength(8000);
  });
  it("tells RESOLVE what the latest assistant turn suggested, and only that turn", () => {
    const followups = [{ label: "Book it", prompt: "Book the tour" }];
    const out = modelHistory([msg("assistant", "old", { suggestedFollowups: followups }), msg("user", "ok"), msg("assistant", "new", { suggestedFollowups: followups })]);
    expect(out[0].content).toBe("old");
    expect(out[2].content).toBe('new\n\n[Suggested next steps shown to the user just now: "Book it" (Book the tour)]');
  });
  it("adds nothing for a turn without suggestions", () => {
    expect(modelHistory([msg("assistant", "a", { suggestedFollowups: [] })])[0].content).toBe("a");
  });
});

describe("lastSuggestedFollowups", () => {
  it("reads the most recent assistant turn's suggestions", () => {
    const f = [{ label: "L", prompt: "P" }];
    expect(lastSuggestedFollowups([{ role: "assistant", content: "", metadata: { suggestedFollowups: [{ label: "x", prompt: "y" }] } }, { role: "assistant", content: "", metadata: { suggestedFollowups: f } }, { role: "user", content: "" }])).toBe(f);
    expect(lastSuggestedFollowups([{ role: "user", content: "" }])).toBeUndefined();
  });
});

describe("surfacedEarlierFrom", () => {
  it("collects the names of places and hotels already shown as cards", () => {
    const stored = [
      { role: "assistant", content: "", metadata: { blocks: [{ type: "place_list", places: [{ name: "Cafe A" }, { name: "Cafe B" }] }, { type: "stays", items: [{ name: "Hotel X" }] }, { type: "actions", items: [] }] } },
      { role: "assistant", content: "", metadata: null },
      { role: "user", content: "" },
    ];
    expect([...surfacedEarlierFrom(stored)]).toEqual(["Cafe A", "Cafe B", "Hotel X"]);
  });
});
