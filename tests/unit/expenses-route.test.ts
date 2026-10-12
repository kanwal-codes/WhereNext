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
      if (table === "trip_members") {
        return { select: () => ({ eq: async () => ({ data: [{ user_id: VIEWER }, { user_id: OTHER }], error: null }) }) };
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

describe("expenses kept in this app (no Splitwise)", () => {
  const rows: Array<Record<string, unknown>> = [];
  function localSupabase() {
    return {
      from(table: string) {
        if (table === "trip_members") return { select: () => ({ eq: async () => ({ data: [{ user_id: VIEWER }, { user_id: OTHER }], error: null }) }) };
        if (table === "trip_expenses") {
          return {
            insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => { rows.push(row); return { data: { id: "e1", created_at: "t", splitwise_expense_id: null, ...row }, error: null }; } }) }),
            select: () => ({ eq: () => ({ order: () => ({ data: rows.map((r, i) => ({ id: `e${i}`, created_at: "t", splitwise_expense_id: null, ...r })), error: null }) }) }),
          };
        }
        if (table === "trips") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { splitwise_group_id: null }, error: null }) }) }) };
        throw new Error(`unexpected table ${table}`);
      },
      rpc: rpcMock,
    };
  }
  const post = async (body: unknown) => {
    const mod = await import("@/app/api/trips/[tripId]/expenses/route");
    return mod.POST(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ tripId: TRIP }) });
  };
  beforeEach(() => {
    rows.length = 0;
    requireTripMemberMock.mockResolvedValue({ supabase: localSupabase(), user: { id: VIEWER } });
    liveSplitwiseAccessTokenMock.mockResolvedValue(null);
  });

  it("logs an expense without a Splitwise account, paid by the logger and shared with everyone", async () => {
    const res = await post({ description: "Pizza", amount: 60, currency: "EUR" });
    expect(res.status).toBe(201);
    expect(rows[0]).toMatchObject({ paid_by: VIEWER, amount: 60, currency: "EUR", split: {} });
    expect((await res.json()).expense).toMatchObject({ source: "local", splitAmong: null });
  });
  it("records who it is split with, and refuses people who are not on the trip", async () => {
    expect((await post({ description: "Taxi", amount: 30, currency: "EUR", splitAmong: [VIEWER, OTHER] })).status).toBe(201);
    expect(rows[0]!.split).toEqual({ among: [VIEWER, OTHER] });
    expect((await post({ description: "Taxi", amount: 30, currency: "EUR", splitAmong: ["44444444-4444-4444-8444-444444444444"] })).status).toBe(400);
    expect((await post({ description: "Taxi", amount: 30, currency: "EUR", paidBy: "44444444-4444-4444-8444-444444444444" })).status).toBe(400);
  });
  it("a retry with the same idempotency key returns the expense that already exists instead of failing", async () => {
    const existing = { id: "e-old", description: "Pizza", amount: 60, currency: "EUR", paid_by: VIEWER, created_by: VIEWER, created_at: "t", split: {}, splitwise_expense_id: null };
    requireTripMemberMock.mockResolvedValue({
      supabase: {
        from(table: string) {
          if (table === "trip_members") return { select: () => ({ eq: async () => ({ data: [{ user_id: VIEWER }], error: null }) }) };
          return {
            insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }) }) }),
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }), single: async () => ({ data: existing, error: null }) }) }) }),
          };
        },
        rpc: rpcMock,
      },
      user: { id: VIEWER },
    });
    const res = await post({ description: "Pizza", amount: 60, currency: "EUR", idempotencyKey: "k1" });
    expect(res.status).toBeLessThan(300);
    expect((await res.json()).expense.id).toBe("e-old");
  });
  it("still asks for a connection when Splitwise is requested explicitly", async () => {
    expect((await post({ description: "Dinner", amount: 80, currency: "EUR", splitwise: true })).status).toBe(409);
  });
  it("returns who owes whom for the local expenses", async () => {
    await post({ description: "Dinner", amount: 80, currency: "EUR", paidBy: OTHER });
    tripMemberIdentitiesMock.mockResolvedValue(new Map([[OTHER, { email: "sam@example.com", name: "Sam" }]]));
    const mod = await import("@/app/api/trips/[tripId]/expenses/route");
    const body = await (await mod.GET(new Request("http://localhost/x"), { params: Promise.resolve({ tripId: TRIP }) })).json();
    expect(body.localBalances).toEqual([{ fromUserId: VIEWER, toUserId: OTHER, amount: 40, currency: "EUR", fromName: "You", toName: "Sam" }]);
    expect(body.totals).toEqual([{ currency: "EUR", total: 80 }]);
  });
});

