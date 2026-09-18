import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

const requireTripMemberMock = vi.fn();
const liveSplitwiseAccessTokenMock = vi.fn();
const getGroupBalancesMock = vi.fn();
const tripMemberIdentitiesMock = vi.fn();
const rpcMock = vi.fn();

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
vi.mock("@/lib/server/splitwise-account", () => ({ liveSplitwiseAccessToken: liveSplitwiseAccessTokenMock }));
vi.mock("@/packages/providers/splitwise/client", () => ({
  createGroup: vi.fn(),
  createExpense: vi.fn(),
  getGroupBalances: getGroupBalancesMock,
}));
vi.mock("@/lib/server/trip-member-identities", () => ({ tripMemberIdentities: tripMemberIdentitiesMock }));
vi.mock("@/lib/server/workspace-cache", () => ({ invalidateWorkspace: vi.fn() }));
vi.mock("@/lib/server/rate-limit", () => ({ withinRateLimit: vi.fn().mockResolvedValue(true) }));

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === "trip_expenses") {
        return { select: () => ({ eq: () => ({ order: () => ({ data: [], error: null }) }) }) };
      }
      if (table === "trips") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { splitwise_group_id: "999" }, error: null }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: rpcMock,
  };
}

async function getExpenses() {
  const mod = await import("@/app/api/trips/[tripId]/expenses/route");
  const res = await mod.GET(new Request("http://localhost/x"), { params: Promise.resolve({ tripId: TRIP }) });
  return res.json() as Promise<{ balances: Array<{ fromName: string; toName: string; amount: string }> | null }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTripMemberMock.mockResolvedValue({ supabase: fakeSupabase(), user: { id: VIEWER } });
  liveSplitwiseAccessTokenMock.mockResolvedValue("token");
  tripMemberIdentitiesMock.mockResolvedValue(new Map([[OTHER, { email: "sam@example.com", name: "Sam" }]]));
  rpcMock.mockResolvedValue({
    data: [
      { user_id: VIEWER, splitwise_user_id: "111" },
      { user_id: OTHER, splitwise_user_id: "222" },
    ],
    error: null,
  });
});
afterEach(() => {
  vi.resetModules();
});

describe("GET /api/trips/[tripId]/expenses — balance name resolution", () => {
  it("resolves Splitwise's bare numeric ids to trip member names, and 'You' for the viewer's own side (live-caught: balances rendered as a bare amount with no one attached)", async () => {
    getGroupBalancesMock.mockResolvedValue([{ fromUserId: 111, toUserId: 222, amount: "42.00", currency: "USD" }]);
    const body = await getExpenses();
    expect(body.balances).toEqual([{ fromUserId: 111, toUserId: 222, amount: "42.00", currency: "USD", fromName: "You", toName: "Sam" }]);
  });

  it("resolves the other direction correctly too", async () => {
    getGroupBalancesMock.mockResolvedValue([{ fromUserId: 222, toUserId: 111, amount: "10.50", currency: "USD" }]);
    const body = await getExpenses();
    expect(body.balances).toEqual([{ fromUserId: 222, toUserId: 111, amount: "10.50", currency: "USD", fromName: "Sam", toName: "You" }]);
  });

  it("falls back to 'Someone' for a Splitwise id that isn't a connected trip member", async () => {
    getGroupBalancesMock.mockResolvedValue([{ fromUserId: 999, toUserId: 111, amount: "5.00", currency: "USD" }]);
    const body = await getExpenses();
    expect(body.balances?.[0]).toMatchObject({ fromName: "Someone", toName: "You" });
  });
});
