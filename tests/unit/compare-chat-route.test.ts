import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";

const requireTripMemberMock = vi.fn();
const loadTripContextMock = vi.fn();
const generateTextMock = vi.fn();

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
vi.mock("@/lib/application/trip-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/application/trip-context")>()),
  loadTripContext: loadTripContextMock,
  serializeTripContext: () => '{"trip":"ctx"}',
}));
vi.mock("@/packages/ai/model-policy", () => ({ generateText: generateTextMock }));

// Phase 5 convergence (docs/overhaul/roadmap/phase-5-optional-improvements.md): the route now
// pipes its answer through the same sanitizer + grounding-evaluator pass COMPOSE uses — mocked
// out here (same pattern as ai-route.test.ts) so this file stays about the route's own request/
// response shape, not the evaluator's own behavior (covered by evaluator.test.ts).
const finalizeAssistantTextMock = vi.fn(async (content: string, _allowedUrls: Set<string>, _groundingText: string) => content);
vi.mock("@/lib/application/evaluator", () => ({ finalizeAssistantText: finalizeAssistantTextMock }));

async function post(body: unknown) {
  const mod = await import("@/app/api/trips/[tripId]/compare-chat/route");
  const req = new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return mod.POST(req, { params: Promise.resolve({ tripId: TRIP }) });
}
const validBody = { items: [{ name: "Alfama" }, { name: "Bairro Alto" }], messages: [{ role: "user", content: "which one?" }] };

beforeEach(() => {
  vi.clearAllMocks();
  requireTripMemberMock.mockResolvedValue({ supabase: {}, user: { id: "u1" }, role: "owner" });
  loadTripContextMock.mockResolvedValue({ lockedStay: null, preferences: {} });
  generateTextMock.mockResolvedValue("The Plateau.");
  finalizeAssistantTextMock.mockImplementation(async (content) => content);
});
afterEach(() => vi.resetModules());

describe("POST /api/trips/:tripId/compare-chat", () => {
  it("returns the model's answer as plain text — one buffered call, not a stream", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await res.text()).toBe("The Plateau.");
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
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("maps an auth error to its status", async () => {
    requireTripMemberMock.mockRejectedValue(new TripAuthError(404, "Trip not found"));
    expect((await post(validBody)).status).toBe(404);
  });

  it("503 when the model call throws", async () => {
    generateTextMock.mockRejectedValue(new Error("provider 500"));
    const res = await post(validBody);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/unavailable/i);
  });

  it("system prompt lists the options, the trip context, and the no-stay-locked note", async () => {
    await post(validBody);
    const system = String((generateTextMock.mock.calls[0] as unknown as [string, Array<{ content: string }>])[1][0].content);
    expect(system).toContain("1. Alfama");
    expect(system).toContain("2. Bairro Alto");
    expect(system).toContain('{"trip":"ctx"}');
    expect(system).toMatch(/No accommodation is locked/);
  });

  it("routes the model's answer through the shared sanitizer + grounding evaluator, grounded in the options list (Phase 5 convergence)", async () => {
    finalizeAssistantTextMock.mockResolvedValue("Go with Alfama — softened by the shared pipeline.");
    const res = await post(validBody);
    expect(await res.text()).toBe("Go with Alfama — softened by the shared pipeline.");
    expect(finalizeAssistantTextMock).toHaveBeenCalledTimes(1);
    const [content, allowedUrls, groundingText] = finalizeAssistantTextMock.mock.calls[0] as [string, Set<string>, string];
    expect(content).toBe("The Plateau.");
    expect(allowedUrls.size).toBe(0);
    expect(groundingText).toContain("1. Alfama");
    expect(groundingText).toContain("2. Bairro Alto");
  });

  it("uses the shared dislikesInstruction wording, not a hand-copied variant", async () => {
    loadTripContextMock.mockResolvedValue({ lockedStay: null, preferences: { dislikes: ["nightclubs"] } });
    await post(validBody);
    const system = String((generateTextMock.mock.calls[0] as unknown as [string, Array<{ content: string }>])[1][0].content);
    expect(system).toContain("The traveller dislikes: nightclubs. Do not recommend, list, or describe any of these, even if they are famous or in the evidence.");
  });

  it("adds straight-line distance from a locked stay with coordinates", async () => {
    loadTripContextMock.mockResolvedValue({ lockedStay: { hotelName: "Hotel Bairro", latitude: 38.71, longitude: -9.14 }, preferences: {} });
    await post({
      items: [{ name: "Rooftop Bar", lat: 38.72, lng: -9.13 }],
      messages: [{ role: "user", content: "good?" }],
    });
    const system = String((generateTextMock.mock.calls[0] as unknown as [string, Array<{ content: string }>])[1][0].content);
    expect(system).toMatch(/staying at Hotel Bairro/);
    expect(system).toMatch(/~\d+\.\d km straight-line from Hotel Bairro/);
  });
});
