import { describe, expect, it } from "vitest";
import { describeProposal } from "@/features/conversation/ui/ConversationSurface";
import type { ProposedCommand } from "@/packages/contracts/assistant";

const TRIP_ID = "11111111-1111-1111-1111-111111111111";

describe("describeProposal (update_preferences)", () => {
  // Live bug (Montreal QA pass, 2026-09-16): the model's structured-output call included an
  // empty `operations: []` alongside a real `budget`/`pace` update, and the confirm dialog
  // rendered it as a literal "Operations: —" row — an internal control field masquerading as a
  // user-facing preference.
  it("does not render a raw 'Operations' row for an empty operations array", () => {
    const proposal: ProposedCommand = { type: "update_preferences", tripId: TRIP_ID, preferences: { budget: 2000, pace: "moderate", operations: [] } };
    const rows = describeProposal(proposal);
    expect(rows).toEqual([
      ["Budget", "2000"],
      ["Pace", "moderate"],
    ]);
  });

  it("expands an add/remove/replace operation into a labeled row instead of hiding it", () => {
    const proposal: ProposedCommand = {
      type: "update_preferences",
      tripId: TRIP_ID,
      preferences: { operations: [{ action: "remove", field: "dislikes", values: ["museums"] }] },
    };
    expect(describeProposal(proposal)).toEqual([["Dislikes", "remove: museums"]]);
  });

  it("renders a clear operation without a dangling colon", () => {
    const proposal: ProposedCommand = {
      type: "update_preferences",
      tripId: TRIP_ID,
      preferences: { operations: [{ action: "clear", field: "likes" }] },
    };
    expect(describeProposal(proposal)).toEqual([["Likes", "clear"]]);
  });

  it("renders both a plain field and its operations when both are present", () => {
    const proposal: ProposedCommand = {
      type: "update_preferences",
      tripId: TRIP_ID,
      preferences: { budget: 500, operations: [{ action: "add", field: "interests", values: ["food", "nightlife"] }] },
    };
    expect(describeProposal(proposal)).toEqual([
      ["Budget", "500"],
      ["Interests", "add: food, nightlife"],
    ]);
  });
});
