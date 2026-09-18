import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";
const POLL = "22222222-2222-4222-8222-222222222222";
const VIEWER = "33333333-3333-4333-8333-333333333333";

const requireTripMemberMock = vi.fn();
const upsertMock = vi.fn();

class TripAuthError extends Error {
  constructor(readonly status: 401 | 403 | 404, message: string) { super(message); this.name = "TripAuthError"; }
}

vi.mock("@/lib/server/trip-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireTripMember: requireTripMemberMock,
    tripAuthResponse: (e: unknown) => (e instanceof TripAuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : null),
  };
});
vi.mock("@/lib/server/workspace-cache", () => ({ invalidateWorkspace: vi.fn() }));
vi.mock("@/lib/server/poll", () => ({ resolvePolls: vi.fn().mockResolvedValue(new Map([[POLL, { id: POLL, question: "Q?", options: [], totalVotes: 1, createdBy: VIEWER }]])) }));

function fakeSupabase(pollRow: { id: string; options: Array<{ key: string }> } | null) {
  return {
    from(table: string) {
      if (table === "trip_polls") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: pollRow, error: null }) }) }) }) };
      if (table === "trip_poll_votes") return { upsert: upsertMock };
      throw new Error(`unexpected table ${table}`);
    },
  };
}

async function vote(body: unknown, pollRow: { id: string; options: Array<{ key: string }> } | null = { id: POLL, options: [{ key: "1" }, { key: "2" }] }) {
  requireTripMemberMock.mockResolvedValue({ supabase: fakeSupabase(pollRow), user: { id: VIEWER } });
  const mod = await import("@/app/api/trips/[tripId]/polls/[pollId]/vote/route");
  const req = new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
  return mod.POST(req, { params: Promise.resolve({ tripId: TRIP, pollId: POLL }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  upsertMock.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.resetModules();
});

describe("POST /api/trips/[tripId]/polls/[pollId]/vote", () => {
  it("upserts the vote for a real option and returns the resolved tally", async () => {
    const res = await vote({ optionKey: "1" });
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith({ poll_id: POLL, trip_id: TRIP, user_id: VIEWER, option_key: "1" }, { onConflict: "poll_id,user_id" });
    const body = await res.json();
    expect(body.poll.id).toBe(POLL);
  });

  it("rejects an option key that isn't actually on this poll", async () => {
    const res = await vote({ optionKey: "not-a-real-option" });
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("404s when the poll doesn't exist on this trip", async () => {
    const res = await vote({ optionKey: "1" }, null);
    expect(res.status).toBe(404);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("400s on a missing optionKey", async () => {
    const res = await vote({});
    expect(res.status).toBe(400);
  });
});
