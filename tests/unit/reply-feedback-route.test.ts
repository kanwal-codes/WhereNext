import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";
const MESSAGE = "22222222-2222-4222-8222-222222222222";

const requireTripMemberMock = vi.fn();
const findReply = vi.fn();
const rate = vi.fn();
const clear = vi.fn();

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
vi.mock("@/features/conversation/infrastructure/replyFeedbackRepository", () => ({
  createReplyFeedbackRepository: () => ({ findReply, rate, clear }),
}));

async function put(body: unknown) {
  const mod = await import("@/app/api/trips/[tripId]/conversation/feedback/route");
  const req = new Request("http://localhost/x", { method: "PUT", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return mod.PUT(req, { params: Promise.resolve({ tripId: TRIP }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTripMemberMock.mockResolvedValue({ supabase: {}, user: { id: "u1" }, role: "viewer" });
  findReply.mockResolvedValue(MESSAGE);
});
afterEach(() => vi.resetModules());

describe("PUT /api/trips/:tripId/conversation/feedback", () => {
  it("401 with no session, and 404 for a non-member, before touching any feedback", async () => {
    requireTripMemberMock.mockRejectedValueOnce(new TripAuthError(401, "Authentication required"));
    expect((await put({ messageId: MESSAGE, rating: "up" })).status).toBe(401);
    requireTripMemberMock.mockRejectedValueOnce(new TripAuthError(404, "Trip not found"));
    expect((await put({ messageId: MESSAGE, rating: "up" })).status).toBe(404);
    expect(findReply).not.toHaveBeenCalled();
    expect(rate).not.toHaveBeenCalled();
  });

  it("lets a read-only member rate (it is their own thread)", async () => {
    expect((await put({ messageId: MESSAGE, rating: "up" })).status).toBe(200);
  });

  it.each([
    ["not json", "{nope"],
    ["unknown rating", { messageId: MESSAGE, rating: "meh" }],
    ["missing rating", { messageId: MESSAGE }],
    ["bad reply id", { messageId: "not-an-id", rating: "up" }],
    ["note over 280", { messageId: MESSAGE, rating: "down", note: "x".repeat(281) }],
  ])("400 on %s", async (_name, body) => {
    expect((await put(body)).status).toBe(400);
    expect(rate).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("404 when the reply is not one of the caller's own replies in this trip", async () => {
    findReply.mockResolvedValue(null);
    const res = await put({ messageId: MESSAGE, rating: "down" });
    expect(res.status).toBe(404);
    expect(findReply).toHaveBeenCalledWith(TRIP, MESSAGE);
    expect(rate).not.toHaveBeenCalled();
  });

  it("sets a rating (upsert) with no note for a thumbs-up, dropping any note sent with it", async () => {
    const res = await put({ messageId: MESSAGE, rating: "up", note: "ignored" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messageId: MESSAGE, rating: "up" });
    expect(rate).toHaveBeenCalledWith(TRIP, "u1", MESSAGE, "up", null);
  });

  it("changes a rating to a thumbs-down with a trimmed note", async () => {
    await put({ messageId: MESSAGE, rating: "down", note: "  gave me closed places  " });
    expect(rate).toHaveBeenCalledWith(TRIP, "u1", MESSAGE, "down", "gave me closed places");
  });

  it("clears with rating null", async () => {
    const res = await put({ messageId: MESSAGE, rating: null });
    expect(await res.json()).toEqual({ messageId: MESSAGE, rating: null });
    expect(clear).toHaveBeenCalledWith("u1", MESSAGE);
    expect(rate).not.toHaveBeenCalled();
  });

  it("accepts the local id of a just-streamed reply and rates the stored row it resolves to", async () => {
    const res = await put({ messageId: "local-assistant-3f2a-key", rating: "up" });
    expect(res.status).toBe(200);
    expect(findReply).toHaveBeenCalledWith(TRIP, "local-assistant-3f2a-key");
    expect(rate).toHaveBeenCalledWith(TRIP, "u1", MESSAGE, "up", null);
  });

  it("503 when the write fails", async () => {
    rate.mockRejectedValue(new Error("pg down"));
    expect((await put({ messageId: MESSAGE, rating: "up" })).status).toBe(503);
  });
});
