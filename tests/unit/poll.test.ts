import { describe, expect, it } from "vitest";
import { resolvePolls } from "../../lib/server/poll";

const VIEWER = "viewer-1";
const OTHER = "other-1";

function fakeSupabase(polls: unknown[], votes: unknown[]) {
  return {
    from(table: string) {
      if (table === "trip_polls") return { select: () => ({ in: async () => ({ data: polls, error: null }) }) };
      if (table === "trip_poll_votes") return { select: () => ({ in: async () => ({ data: votes, error: null }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("resolvePolls", () => {
  it("tallies votes per option and flags the viewer's own pick", async () => {
    const supabase = fakeSupabase(
      [{ id: "p1", question: "Which hotel?", options: [{ key: "1", label: "Hotel A" }, { key: "2", label: "Hotel B" }], created_by: OTHER }],
      [
        { poll_id: "p1", user_id: VIEWER, option_key: "1" },
        { poll_id: "p1", user_id: OTHER, option_key: "2" },
      ],
    );
    const resolved = await resolvePolls(supabase as never, ["p1"], VIEWER);
    expect(resolved.get("p1")).toEqual({
      id: "p1",
      question: "Which hotel?",
      totalVotes: 2,
      createdBy: OTHER,
      options: [
        { key: "1", label: "Hotel A", count: 1, mine: true },
        { key: "2", label: "Hotel B", count: 1, mine: false },
      ],
    });
  });

  it("returns zero-vote options for a fresh poll nobody has voted on yet", async () => {
    const supabase = fakeSupabase([{ id: "p1", question: "Q?", options: [{ key: "1", label: "A" }, { key: "2", label: "B" }], created_by: VIEWER }], []);
    const resolved = await resolvePolls(supabase as never, ["p1"], VIEWER);
    expect(resolved.get("p1")).toMatchObject({ totalVotes: 0, options: [{ key: "1", count: 0, mine: false }, { key: "2", count: 0, mine: false }] });
  });

  it("returns an empty map for an empty id list without querying", async () => {
    const resolved = await resolvePolls({ from: () => { throw new Error("must not be called"); } } as never, [], VIEWER);
    expect(resolved.size).toBe(0);
  });
});
