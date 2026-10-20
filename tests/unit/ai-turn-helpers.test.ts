import { describe, expect, it } from "vitest";
import { lastSuggestedFollowups, modelHistory, surfacedEarlierFrom } from "../../lib/application/orchestrate/thread-history";
import { SSE_HEADERS, doneFrame, isAbortError, progressFrame, textFrame, toolProgressLabel, truncatedFrame } from "../../lib/server/ai-stream-frames";

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

describe("toolProgressLabel", () => {
  it("names one or two activities and drops the rest", () => {
    expect(toolProgressLabel(["search_places"])).toBe("finding places");
    expect(toolProgressLabel(["search_places", "weather"])).toBe("finding places and checking the forecast");
    expect(toolProgressLabel(["search_places", "weather", "flights", "stays"])).toBe("finding places and checking the forecast");
  });
  it("does not repeat an activity, and says nothing for tools it cannot name", () => {
    expect(toolProgressLabel(["search_places", "search_places"])).toBe("finding places");
    expect(toolProgressLabel([])).toBeUndefined();
    expect(toolProgressLabel(["mystery"])).toBeUndefined();
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
