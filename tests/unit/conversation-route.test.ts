import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";

const requireTripMemberMock = vi.fn();
const listMock = vi.fn();
const appendMock = vi.fn();

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
    tripAuthResponse: (e: unknown) =>
      e instanceof TripAuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : null,
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ __admin: true }) }));
vi.mock("@/features/conversation/infrastructure/conversationRepository", () => ({
  createConversationRepository: () => ({ list: listMock, append: appendMock }),
}));

async function GET() {
  const mod = await import("@/app/api/trips/[tripId]/conversation/route");
  return mod.GET(new Request("http://localhost/x"), { params: Promise.resolve({ tripId: TRIP }) });
}
async function POST(body: unknown) {
  const mod = await import("@/app/api/trips/[tripId]/conversation/route");
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return mod.POST(req, { params: Promise.resolve({ tripId: TRIP }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTripMemberMock.mockResolvedValue({ supabase: {}, user: { id: "u1" }, role: "owner" });
  listMock.mockResolvedValue([{ id: "m1", role: "user", content: "hi" }]);
  appendMock.mockImplementation(async (_t, _u, input) => ({ id: "m2", ...input }));
});
afterEach(() => vi.resetModules());

describe("GET /api/trips/:tripId/conversation", () => {
  it("returns the message list for a member", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: [{ id: "m1", role: "user", content: "hi" }] });
    expect(listMock).toHaveBeenCalledWith(TRIP, "u1");
  });

  it("maps an auth error to its status (404 for a non-member — existence is not leaked)", async () => {
    requireTripMemberMock.mockRejectedValue(new TripAuthError(404, "Trip not found"));
    expect((await GET()).status).toBe(404);
  });

  it("401 with no session", async () => {
    requireTripMemberMock.mockRejectedValue(new TripAuthError(401, "Authentication required"));
    expect((await GET()).status).toBe(401);
  });

  it("returns 503 'Conversation unavailable' when the repo read throws", async () => {
    listMock.mockRejectedValue(new Error("pg down"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Conversation unavailable");
  });
});

describe("POST /api/trips/:tripId/conversation", () => {
  it("appends a valid user message and returns 201", async () => {
    const res = await POST({ role: "user", content: "any concerts?", idempotencyKey: "abc" });
    expect(res.status).toBe(201);
    expect(appendMock).toHaveBeenCalledWith(TRIP, "u1", { role: "user", content: "any concerts?", idempotencyKey: "abc" });
    expect((await res.json()).message).toMatchObject({ id: "m2", content: "any concerts?" });
  });

  it("400 on a missing content field", async () => {
    const res = await POST({ role: "user" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid message");
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("400 when the role is not literally 'user'", async () => {
    expect((await POST({ role: "assistant", content: "hi" })).status).toBe(400);
  });

  it("400 on content that is whitespace-only or over 8000 chars", async () => {
    expect((await POST({ role: "user", content: "   " })).status).toBe(400);
    expect((await POST({ role: "user", content: "x".repeat(8001) })).status).toBe(400);
  });

  it("400 on a non-JSON body", async () => {
    expect((await POST("not json")).status).toBe(400);
  });

  it("maps an auth error", async () => {
    requireTripMemberMock.mockRejectedValue(new TripAuthError(403, "Trip access denied"));
    expect((await POST({ role: "user", content: "hi" })).status).toBe(403);
  });

  it("503 when the append write throws", async () => {
    appendMock.mockRejectedValue(new Error("unique violation"));
    expect((await POST({ role: "user", content: "hi" })).status).toBe(503);
  });
});
