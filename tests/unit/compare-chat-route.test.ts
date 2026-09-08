import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";

const requireTripMemberMock = vi.fn();
const loadTripContextMock = vi.fn();
const streamMock = vi.fn();

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
vi.mock("@/lib/application/trip-context", () => ({
  loadTripContext: loadTripContextMock,
  serializeTripContext: () => '{"trip":"ctx"}',
}));
vi.mock("@/packages/ai/model-policy", () => ({ gatewayFor: () => ({ stream: streamMock }) }));

function sse(...contents: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of contents) controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`));
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.enqueue(enc.encode("data: {\"choices\":[{\"delta\":{\"content\":\"AFTER DONE\"}}]}\n\n"));
      controller.close();
    },
  });
}

async function post(body: unknown) {
  const mod = await import("@/app/api/trips/[tripId]/compare-chat/route");
  const req = new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return mod.POST(req, { params: Promise.resolve({ tripId: TRIP }) });
}
const validBody = { items: [{ name: "Alfama" }, { name: "Bairro Alto" }], messages: [{ role: "user", content: "which one?" }] };

beforeEach(() => {
  vi.clearAllMocks();
  requireTripMemberMock.mockResolvedValue({ supabase: {}, user: { id: "u1" }, role: "owner" });
  loadTripContextMock.mockResolvedValue({ lockedStay: null });
  streamMock.mockResolvedValue(sse("The ", "Plateau."));
});
afterEach(() => vi.resetModules());

describe("POST /api/trips/:tripId/compare-chat", () => {
  it("re-emits the model deltas as a plain-text stream, stopping at [DONE]", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const text = await res.text();
    expect(text).toBe("The Plateau."); // no SSE wrapping, and "AFTER DONE" was dropped
  });

  it("400 'Invalid compare request' on a bad body", async () => {
    for (const bad of [
      { items: [], messages: validBody.messages },
      { items: Array.from({ length: 7 }, (_, i) => ({ name: `x${i}` })), messages: validBody.messages },
      { items: validBody.items, messages: [] },
      { items: validBody.items, messages: [{ role: "user", content: "x".repeat(4001) }] },
    ]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid compare request");
    }
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("maps an auth error to its status", async () => {
    requireTripMemberMock.mockRejectedValue(new TripAuthError(404, "Trip not found"));
    expect((await post(validBody)).status).toBe(404);
  });

  it("503 when the model stream call throws", async () => {
    streamMock.mockRejectedValue(new Error("provider 500"));
    const res = await post(validBody);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/unavailable/i);
  });

  it("system prompt lists the options, the trip context, and the no-stay-locked note", async () => {
    await post(validBody).then((r) => r.text());
    const system = String((streamMock.mock.calls[0] as unknown as [Array<{ content: string }>])[0][0].content);
    expect(system).toContain("1. Alfama");
    expect(system).toContain("2. Bairro Alto");
    expect(system).toContain('{"trip":"ctx"}');
    expect(system).toMatch(/No accommodation is locked/);
  });

  it("adds straight-line distance from a locked stay with coordinates", async () => {
    loadTripContextMock.mockResolvedValue({ lockedStay: { hotelName: "Hotel Bairro", latitude: 38.71, longitude: -9.14 } });
    await post({
      items: [{ name: "Rooftop Bar", lat: 38.72, lng: -9.13 }],
      messages: [{ role: "user", content: "good?" }],
    }).then((r) => r.text());
    const system = String((streamMock.mock.calls[0] as unknown as [Array<{ content: string }>])[0][0].content);
    expect(system).toMatch(/staying at Hotel Bairro/);
    expect(system).toMatch(/~\d+\.\d km straight-line from Hotel Bairro/);
  });
});
