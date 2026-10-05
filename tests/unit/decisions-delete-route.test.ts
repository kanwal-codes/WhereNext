import { beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";
const requireTripMemberMock = vi.fn();
const invalidate = vi.fn();

vi.mock("@/lib/server/trip-auth", async () => {
  const { NextResponse } = await import("next/server");
  return { requireTripMember: requireTripMemberMock, tripAuthResponse: () => null, NextResponse };
});
vi.mock("@/lib/server/workspace-cache", () => ({ invalidateWorkspace: invalidate }));

/** Records every filter the route chains onto the delete. */
function fakeSupabase() {
  const filters: Array<[string, unknown]> = [];
  const chain: Record<string, unknown> = {
    eq: (column: string, value: unknown) => { filters.push([column, value]); return chain; },
    then: (resolve: (v: unknown) => void) => resolve({ error: null }),
  };
  return { filters, supabase: { from: () => ({ delete: () => chain }) } };
}

async function del(kind: string | null) {
  const mod = await import("@/app/api/trips/[tripId]/decisions/route");
  const url = `http://localhost/x${kind ? `?kind=${kind}` : ""}`;
  return mod.DELETE(new Request(url, { method: "DELETE" }), { params: Promise.resolve({ tripId: TRIP }) });
}

let fake: ReturnType<typeof fakeSupabase>;
beforeEach(() => {
  vi.clearAllMocks();
  fake = fakeSupabase();
  requireTripMemberMock.mockResolvedValue({ supabase: fake.supabase, user: { id: "u1" }, role: "owner" });
});

describe("DELETE /decisions", () => {
  it("clears every stay lock and nothing else", async () => {
    const res = await del("stay");
    expect(res.status).toBe(200);
    expect(fake.filters).toEqual([["trip_id", TRIP], ["kind", "stay"]]);
    expect(invalidate).toHaveBeenCalledWith(TRIP);
  });

  it("clears only the flight choice, leaving other transport decisions", async () => {
    await del("flight");
    expect(fake.filters).toEqual([["trip_id", TRIP], ["kind", "transport"], ["value->>mode", "flight"]]);
  });

  it("refuses any other kind, so a decision like preferences can't be wiped from here", async () => {
    expect((await del("preferences")).status).toBe(400);
    expect((await del(null)).status).toBe(400);
    expect(fake.filters).toEqual([]);
  });

  it("needs an editor", async () => {
    await del("stay");
    expect(requireTripMemberMock).toHaveBeenCalledWith(TRIP, { role: "editor" });
  });
});
