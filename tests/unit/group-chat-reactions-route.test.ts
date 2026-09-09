import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";
const MESSAGE = "22222222-2222-4222-8222-222222222222";

const requireTripMemberMock = vi.fn();

class TripAuthError extends Error {
  constructor(readonly status: 401 | 403 | 404, message: string) {
    super(message);
    this.name = "TripAuthError";
  }
}

vi.mock("@/lib/server/trip-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireTripMember: requireTripMemberMock,
    tripAuthResponse: (e: unknown) => (e instanceof TripAuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : null),
  };
});

/** Mimics just enough of a supabase-js query builder for this route's exact call shapes. */
function makeSupabase(opts: { existing: boolean; insertErrorCode?: string }) {
  const deleteChain = {
    eq: () => deleteChain,
    then: (resolve: (v: { error: unknown }) => void) => resolve({ error: null }),
  };
  const selectChain = {
    eq: () => selectChain,
    maybeSingle: async () => ({ data: opts.existing ? { message_id: MESSAGE } : null, error: null }),
  };
  return {
    from: () => ({
      select: () => selectChain,
      delete: () => deleteChain,
      insert: async () => ({ error: opts.insertErrorCode ? { code: opts.insertErrorCode, message: "duplicate key" } : null }),
    }),
  };
}

async function post(body: unknown, supabase: ReturnType<typeof makeSupabase>) {
  requireTripMemberMock.mockResolvedValue({ supabase, user: { id: "u1" }, role: "owner" });
  const mod = await import("@/app/api/trips/[tripId]/group-chat/[messageId]/reactions/route");
  const req = new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return mod.POST(req, { params: Promise.resolve({ tripId: TRIP, messageId: MESSAGE }) });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.resetModules());

describe("POST /api/trips/:tripId/group-chat/:messageId/reactions", () => {
  it("reacts when the caller hasn't reacted with this emoji yet", async () => {
    const res = await post({ emoji: "🎉" }, makeSupabase({ existing: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reacted: true });
  });

  it("un-reacts (toggles off) when the caller already reacted with this emoji", async () => {
    const res = await post({ emoji: "🎉" }, makeSupabase({ existing: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reacted: false });
  });

  it("treats a racing duplicate insert (two fast taps losing the same check) as success, not a 500", async () => {
    // existing:false — this request's own read-then-write race lost to another request for the
    // same (message, user, emoji): by the time it inserts, the row is already there.
    const res = await post({ emoji: "🎉" }, makeSupabase({ existing: false, insertErrorCode: "23505" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reacted: true });
  });

  it("still surfaces a genuine insert failure", async () => {
    const res = await post({ emoji: "🎉" }, makeSupabase({ existing: false, insertErrorCode: "53300" }));
    expect(res.status).toBe(503);
  });

  it("400 on an invalid emoji", async () => {
    const res = await post({ emoji: "" }, makeSupabase({ existing: false }));
    expect(res.status).toBe(400);
  });

  it("maps an auth error", async () => {
    requireTripMemberMock.mockRejectedValue(new TripAuthError(403, "Trip access denied"));
    const mod = await import("@/app/api/trips/[tripId]/group-chat/[messageId]/reactions/route");
    const req = new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emoji: "🎉" }) });
    const res = await mod.POST(req, { params: Promise.resolve({ tripId: TRIP, messageId: MESSAGE }) });
    expect(res.status).toBe(403);
  });
});
