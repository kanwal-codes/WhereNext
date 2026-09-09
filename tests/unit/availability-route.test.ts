import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";

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

const selectRows = [
  { id: "r1", user_id: "u1", start_date: "2026-06-10", end_date: "2026-06-14" },
  { id: "r2", user_id: "u2", start_date: "2026-06-12", end_date: "2026-06-16" },
];

function fakeSupabase() {
  const deleteEq2 = vi.fn(async () => ({ error: null }));
  const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));
  const insertSelect = vi.fn(async () => ({ data: [{ id: "r3", user_id: "u1", start_date: "2026-07-01", end_date: "2026-07-05" }], error: null }));
  const table = {
    select: () => ({ eq: () => ({ order: async () => ({ data: selectRows, error: null }) }) }),
    delete: () => ({ eq: deleteEq1 }),
    insert: () => ({ select: insertSelect }),
  };
  return { supabase: { from: () => table } as never };
}

async function get() {
  const mod = await import("@/app/api/trips/[tripId]/availability/route");
  return mod.GET(new Request("http://localhost/x"), { params: Promise.resolve({ tripId: TRIP }) });
}
async function put(body: unknown) {
  const mod = await import("@/app/api/trips/[tripId]/availability/route");
  const req = new Request("http://localhost/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return mod.PUT(req, { params: Promise.resolve({ tripId: TRIP }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTripMemberMock.mockResolvedValue({ ...fakeSupabase(), user: { id: "u1" }, role: "owner" });
});
afterEach(() => vi.resetModules());

describe("GET /api/trips/:tripId/availability", () => {
  it("returns every member's ranges plus the computed overlap", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ranges).toHaveLength(2);
    expect(body.overlaps.length).toBeGreaterThan(0);
  });
});

describe("PUT /api/trips/:tripId/availability", () => {
  it("replaces the caller's own ranges", async () => {
    const res = await put({ ranges: [{ startDate: "2026-07-01", endDate: "2026-07-05" }] });
    expect(res.status).toBe(200);
    expect((await res.json()).ranges).toEqual([{ id: "r3", userId: "u1", startDate: "2026-07-01", endDate: "2026-07-05" }]);
  });

  it("400 on an empty range list", async () => {
    const res = await put({ ranges: [] });
    expect(res.status).toBe(400);
  });

  it("400 when endDate precedes startDate", async () => {
    const res = await put({ ranges: [{ startDate: "2026-07-05", endDate: "2026-07-01" }] });
    expect(res.status).toBe(400);
  });
});
