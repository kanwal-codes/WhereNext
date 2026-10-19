import { beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

class TripAuthError extends Error {
  constructor(readonly status: 401 | 403 | 404 | 429, message: string) { super(message); this.name = "TripAuthError"; }
}

const requireTripMemberMock = vi.fn();
vi.mock("@/lib/server/trip-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireTripMember: requireTripMemberMock,
    tripAuthResponse: (e: unknown) => (e instanceof TripAuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : null),
  };
});

const rpc = vi.fn();
const upsert = vi.fn();
const params = { params: Promise.resolve({ tripId: TRIP }) };

beforeEach(() => {
  vi.clearAllMocks();
  requireTripMemberMock.mockResolvedValue({ supabase: { rpc, from: () => ({ upsert }) }, user: { id: USER } });
});

describe("group chat unread route", () => {
  it("returns the count the database computes, and never caches it", async () => {
    rpc.mockResolvedValue({ data: 8, error: null });
    const { GET } = await import("../../app/api/trips/[tripId]/group-chat/unread/route");
    const response = await GET(new Request("http://x"), params);
    expect(rpc).toHaveBeenCalledWith("group_chat_unread", { p_trip_id: TRIP });
    expect(await response.json()).toEqual({ count: 8 });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("counts a missing value as zero, and refuses a guest", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { GET } = await import("../../app/api/trips/[tripId]/group-chat/unread/route");
    expect(await (await GET(new Request("http://x"), params)).json()).toEqual({ count: 0 });
    expect(requireTripMemberMock).toHaveBeenCalledWith(TRIP, { registered: true });
    requireTripMemberMock.mockRejectedValueOnce(new TripAuthError(403, "Save your trip with an account to use this."));
    expect((await GET(new Request("http://x"), params)).status).toBe(403);
  });

  it("marks the chat read for the signed-in member only", async () => {
    upsert.mockResolvedValue({ error: null });
    const { POST } = await import("../../app/api/trips/[tripId]/group-chat/unread/route");
    const response = await POST(new Request("http://x", { method: "POST" }), params);
    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: TRIP, user_id: USER }), { onConflict: "trip_id,user_id" });
  });
});
