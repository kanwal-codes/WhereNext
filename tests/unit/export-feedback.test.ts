import { describe, expect, it } from "vitest";
import { namesIn, toReviewResult } from "../../scripts/export-feedback";

const row = {
  message_id: "22222222-2222-4222-8222-222222222222", trip_id: "t", rating: "down" as const, note: "closed on Mondays",
  rated_at: new Date("2026-11-14T10:05:00Z"), replied_at: new Date("2026-11-14T10:00:00Z"), content: "Try Cafe Uno.",
  metadata: { blocks: [{ type: "places", places: [{ name: "Cafe Uno", photoNames: ["x"] }, { name: "Cafe Uno" }] }], sources: [{ title: "Guide" }], language: "en", unverified: true },
  question: "Where should I eat?", destination: "Lisbon, Portugal", travelers: 2, group_type: "couple",
  trace: { intent: "places", tools: ["places"], total_ms: 4000 },
};

describe("export-feedback", () => {
  it("collects card names once", () => {
    expect(namesIn(row.metadata.blocks)).toEqual(["Cafe Uno", "Cafe Uno"]);
  });

  it("shapes a rated reply like a result the review page loads (id, turns, cards, trace, flags) and keeps the note", () => {
    const r = toReviewResult(row);
    expect(r.testCase.description).toBe("feedback-22222222");
    expect(r.response.output).toBe("Try Cafe Uno.");
    const md = r.response.metadata;
    expect(md.turns).toEqual([{ q: "Where should I eat?", text: "Try Cafe Uno." }]);
    expect(md.blocks).toEqual([{ type: "places", names: ["Cafe Uno"] }]);
    expect(md.trace).toMatchObject({ intent: "places", tools: ["places"] });
    expect(md.trip).toEqual({ destination: "Lisbon, Portugal", travelers: 2, groupType: "couple" });
    expect(md.unverified).toBe(true);
    expect(md.feedback).toMatchObject({ rating: "down", note: "closed on Mondays" });
    expect(r.gradingResult.componentResults).toEqual([]);
  });

  it("copes with a reply that has no metadata, question or trace", () => {
    const r = toReviewResult({ ...row, metadata: null, question: null, trace: null, destination: null, travelers: null, group_type: null });
    expect(r.response.metadata.blocks).toEqual([]);
    expect(r.response.metadata.trace).toEqual({});
    expect(r.response.metadata.message).toBe("");
  });
});
