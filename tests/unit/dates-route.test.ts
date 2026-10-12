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

function fakeSupabase(updateResult: { data?: unknown; error?: unknown } = { data: { start_date: "2026-06-10", end_date: "2026-06-14" } }) {
  const single = vi.fn(async () => updateResult);
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  // The route first reads the trip's current start and saved cities, then counts bookings outside the new dates.
  const read = (rows: unknown) => ({ eq: () => Object.assign(Promise.resolve({ data: rows, error: null }), { maybeSingle: async () => ({ data: { start_date: null, stops: null }, error: null }) }) });
  return { supabase: { from: () => ({ update, select: () => read([]) }) } as never, update };
}

async function patch(body: unknown) {
  const mod = await import("@/app/api/trips/[tripId]/dates/route");
  const req = new Request("http://localhost/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return mod.PATCH(req, { params: Promise.resolve({ tripId: TRIP }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTripMemberMock.mockResolvedValue({ ...fakeSupabase(), user: { id: "u1" }, role: "editor" });
});
afterEach(() => vi.resetModules());

describe("PATCH /api/trips/:tripId/dates", () => {
  it("locks the trip's start/end dates", async () => {
    const res = await patch({ startDate: "2026-06-10", endDate: "2026-06-14" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ startDate: "2026-06-10", endDate: "2026-06-14", bookingsOutsideDates: 0 });
  });

  it("400 when endDate is before startDate", async () => {
    const res = await patch({ startDate: "2026-06-14", endDate: "2026-06-10" });
    expect(res.status).toBe(400);
  });

  it("requires editor role — 403 for a viewer", async () => {
    requireTripMemberMock.mockRejectedValue(new TripAuthError(403, "Trip access denied"));
    const res = await patch({ startDate: "2026-06-10", endDate: "2026-06-14" });
    expect(res.status).toBe(403);
  });

  it("maps a 404 for a non-member", async () => {
    requireTripMemberMock.mockRejectedValue(new TripAuthError(404, "Trip not found"));
    expect((await patch({ startDate: "2026-06-10", endDate: "2026-06-14" })).status).toBe(404);
  });
});
