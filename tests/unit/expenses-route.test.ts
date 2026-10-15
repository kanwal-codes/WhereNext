import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

const requireTripMemberMock = vi.fn();
const tripMemberIdentitiesMock = vi.fn();

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
vi.mock("@/lib/server/trip-member-identities", () => ({ tripMemberIdentities: tripMemberIdentitiesMock }));
vi.mock("@/lib/server/workspace-cache", () => ({ invalidateWorkspace: vi.fn() }));
vi.mock("@/lib/server/rate-limit", () => ({ withinRateLimit: vi.fn().mockResolvedValue(true) }));

beforeEach(() => {
  vi.clearAllMocks();
  tripMemberIdentitiesMock.mockResolvedValue(new Map([[OTHER, { email: "sam@example.com", name: "Sam" }]]));
});
afterEach(() => {
  vi.resetModules();
});

describe("expenses kept in this app", () => {
  const rows: Array<Record<string, unknown>> = [];
  function fakeSupabase() {
    return {
      from(table: string) {
        if (table === "trip_members") return { select: () => ({ eq: async () => ({ data: [{ user_id: VIEWER }, { user_id: OTHER }], error: null }) }) };
        if (table === "trip_expenses") {
          return {
            insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => { rows.push(row); return { data: { id: "e1", created_at: "t", splitwise_expense_id: null, ...row }, error: null }; } }) }),
            select: () => ({ eq: () => ({ order: () => ({ data: rows.map((r, i) => ({ id: `e${i}`, created_at: "t", splitwise_expense_id: null, ...r })), error: null }) }) }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
  }
  const post = async (body: unknown) => {
    const mod = await import("@/app/api/trips/[tripId]/expenses/route");
    return mod.POST(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ tripId: TRIP }) });
  };
  beforeEach(() => {
    rows.length = 0;
    requireTripMemberMock.mockResolvedValue({ supabase: fakeSupabase(), user: { id: VIEWER } });
  });

  it("logs an expense, paid by the logger and shared with everyone", async () => {
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
      },
      user: { id: VIEWER },
    });
    const res = await post({ description: "Pizza", amount: 60, currency: "EUR", idempotencyKey: "k1" });
    expect(res.status).toBeLessThan(300);
    expect((await res.json()).expense.id).toBe("e-old");
  });
  it("returns who owes whom for the local expenses", async () => {
    await post({ description: "Dinner", amount: 80, currency: "EUR", paidBy: OTHER });
    const mod = await import("@/app/api/trips/[tripId]/expenses/route");
    const body = await (await mod.GET(new Request("http://localhost/x"), { params: Promise.resolve({ tripId: TRIP }) })).json();
    expect(body.localBalances).toEqual([{ fromUserId: VIEWER, toUserId: OTHER, amount: 40, currency: "EUR", fromName: "You", toName: "Sam" }]);
    expect(body.totals).toEqual([{ currency: "EUR", total: 80 }]);
  });
});
