import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";

const requireTripMemberMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/server/trip-auth", () => ({ requireTripMember: requireTripMemberMock, tripAuthResponse: () => null }));
vi.mock("@/lib/server/workspace-cache", () => ({ invalidateWorkspace: vi.fn() }));
vi.mock("@/lib/server/geocode-stop", () => ({ geocodeStop: vi.fn(async () => null) }));

function fakeSupabase(items: unknown[]) {
  const query = {
    eq: () => query,
    is: () => query,
    order: () => query,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: items, error: null }),
  };
  return { rpc: rpcMock, from: () => ({ select: () => query }) };
}

async function patch(body: unknown, items: unknown[] = []) {
  const mod = await import("@/app/api/trips/[tripId]/itinerary/route");
  const req = new Request("http://localhost/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  requireTripMemberMock.mockResolvedValue({ supabase: fakeSupabase(items), user: { id: "u1" }, role: "editor" });
  return mod.PATCH(req, { params: Promise.resolve({ tripId: TRIP }) });
}

describe("PATCH /api/trips/:tripId/itinerary — bulk reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null });
  });
  afterEach(() => vi.resetModules());

  // Live-testing regression: this used to be N sequential, non-transactional per-row updates —
  // a failure partway through left the itinerary half-reordered with no rollback (same
  // non-atomicity class already fixed once for trip-member role changes, migration 0028). Now
  // one atomic RPC call (0031_atomic_itinerary_reorder). Verified live against a real Supabase
  // project that the RPC itself reorders correctly and skips locked items.
  it("calls the atomic reorder RPC with the full order, mapped to snake_case", async () => {
    const res = await patch({
      order: [
        { title: "Velvet Speakeasy", dayIndex: 1, position: 2 },
        { title: "La Fontaine Park", dayIndex: 1, position: 0 },
      ],
    });
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("reorder_itinerary_items", {
      p_trip_id: TRIP,
      p_order: [
        { title: "Velvet Speakeasy", day_index: 1, position: 2 },
        { title: "La Fontaine Park", day_index: 1, position: 0 },
      ],
    });
  });

  it("propagates an RPC error instead of silently succeeding", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("boom") });
    const res = await patch({ order: [{ title: "X", dayIndex: 1, position: 0 }] });
    expect(res.status).not.toBe(200);
  });
});
