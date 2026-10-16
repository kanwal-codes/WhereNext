import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROUP_HISTORY_LIMIT } from "@/features/group-chat/domain/message";

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
    tripAuthResponse: (e: unknown) => (e instanceof TripAuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : null),
  };
});
vi.mock("@/features/group-chat/infrastructure/groupChatRepository", () => ({
  createGroupChatRepository: () => ({ list: listMock, append: appendMock }),
}));

async function GET() {
  const mod = await import("@/app/api/trips/[tripId]/group-chat/route");
  return mod.GET(new Request("http://localhost/x"), { params: Promise.resolve({ tripId: TRIP }) });
}
async function POST(body: unknown) {
  const mod = await import("@/app/api/trips/[tripId]/group-chat/route");
  const req = new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return mod.POST(req, { params: Promise.resolve({ tripId: TRIP }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTripMemberMock.mockResolvedValue({ supabase: {}, user: { id: "u1" }, role: "owner" });
  listMock.mockResolvedValue([{ id: "m1", userId: "u1", role: "user", kind: "text", content: "hi all", created_at: "2026-01-01T00:00:00Z", reactions: [] }]);
  appendMock.mockImplementation(async (_t, input) => ({ id: "m2", userId: "u1", role: "user", kind: input.kind, content: input.content, created_at: "2026-01-01T00:01:00Z", reactions: [], metadata: input.metadata ?? {} }));
});
afterEach(() => vi.resetModules());

describe("GET /api/trips/:tripId/group-chat", () => {
  it("returns the shared message list, scoped by trip only (not per-user), capped to recent history", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).messages).toHaveLength(1);
    expect(listMock).toHaveBeenCalledWith(TRIP, "u1", { limit: GROUP_HISTORY_LIMIT });
  });

  it("maps an auth error to its status", async () => {
    requireTripMemberMock.mockRejectedValue(new TripAuthError(404, "Trip not found"));
    expect((await GET()).status).toBe(404);
  });
});

describe("POST /api/trips/:tripId/group-chat", () => {
  it("persists a user message and never triggers a Roam reply from this route", async () => {
    const res = await POST({ content: "hey @Roam what time does this cafe open", kind: "text" });
    expect(res.status).toBe(201);
    expect(appendMock).toHaveBeenCalledWith(
      TRIP,
      expect.objectContaining({ userId: "u1", role: "user", kind: "text", content: "hey @Roam what time does this cafe open" }),
    );
    // Persist-only: the route must not import or call anything that would generate an assistant reply.
    expect(appendMock).toHaveBeenCalledTimes(1);
    expect((appendMock.mock.calls[0][1] as { role: string }).role).toBe("user");
  });

  it("400 on an empty message", async () => {
    const res = await POST({ content: "   ", kind: "text" });
    expect(res.status).toBe(400);
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("maps an auth error", async () => {
    requireTripMemberMock.mockRejectedValue(new TripAuthError(403, "Trip access denied"));
    expect((await POST({ content: "hi", kind: "text" })).status).toBe(403);
  });
});
