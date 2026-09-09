import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";

const requireTripMemberMock = vi.fn();
const loadTripContextMock = vi.fn();
const runAssistantTurnMock = vi.fn();
const listMock = vi.fn();
const appendMock = vi.fn();
const generateTextMock = vi.fn();

class TripAuthError extends Error {
  constructor(readonly status: 401 | 403 | 404, message: string) {
    super(message);
    this.name = "TripAuthError";
  }
}

const EMPTY_META = { language: "en", locationFocus: null, surface: "chat" as const, blocks: [] as unknown[], sources: [], suggestedFollowups: [], unavailableProviders: [] };

/** A minimal "ready" AssistantTurnResult — enough for the route to run its own compose call. */
function readyResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: "ready" as const,
    resolved: { intent: "trip_memory", modelUsed: "resolve-model", degraded: false },
    tripCtx: {},
    system: "SYSTEM PROMPT",
    composeSkipLine: null,
    composeTools: {},
    toolEvidence: { usedTools: [], unavailableProviders: [] },
    meta: { ...EMPTY_META },
    allowedUrls: new Set<string>(),
    toolPlan: [],
    evidenceUnavailableProviders: [],
    cardPlaceProviderIds: [],
    sideBuilders: { checklistPromise: Promise.resolve(null), comparisonPromise: Promise.resolve(null) },
    timings: { resolveMs: 5, retrieveMs: 5 },
    ...overrides,
  };
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
  formatTripMemory: () => "trip memory",
}));
vi.mock("@/lib/application/assistant-turn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/application/assistant-turn")>()),
  runAssistantTurn: runAssistantTurnMock,
}));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateText: generateTextMock }));
vi.mock("@/packages/ai/compose-model", () => ({ composeModelChain: () => [{ model: { mock: true }, providerOptions: {}, modelId: "test-model" }] }));
vi.mock("@/lib/server/trip-ai-queue", () => ({ withTripAiTask: (_id: string, task: () => unknown) => task() }));
vi.mock("@/lib/server/ai-turn-trace", () => ({ recordAiTurn: vi.fn(async () => undefined) }));
vi.mock("@/features/group-chat/infrastructure/groupChatRepository", () => ({
  createGroupChatRepository: () => ({ list: listMock, append: appendMock }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: async () => ({ data: [{ user_id: "u1" }], error: null }) }) }),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: "alex@example.com", user_metadata: {} } } }) } },
  }),
}));

async function post(messageId: string | undefined = "m1", explicit?: boolean) {
  const mod = await import("@/app/api/trips/[tripId]/group-chat/roam/route");
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: messageId === undefined ? undefined : JSON.stringify({ messageId, ...(explicit === undefined ? {} : { explicit }) }),
  });
  return mod.POST(req, { params: Promise.resolve({ tripId: TRIP }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTripMemberMock.mockResolvedValue({ supabase: {}, user: { id: "u1" }, role: "owner" });
  loadTripContextMock.mockResolvedValue({ lockedStay: null });
  runAssistantTurnMock.mockResolvedValue(readyResult());
  generateTextMock.mockResolvedValue({ text: "It opens at 9am." });
  listMock.mockResolvedValue([
    { id: "m1", userId: "u1", role: "user", kind: "text", content: "hey @Roam what time does this cafe open", created_at: "2026-01-01T00:00:00Z", reactions: [] },
  ]);
  appendMock.mockImplementation(async (_t, input) => ({ id: "m2", userId: input.userId, role: input.role, kind: input.kind, content: input.content, created_at: "2026-01-01T00:01:00Z", reactions: [], metadata: input.metadata ?? {} }));
});
afterEach(() => vi.resetModules());

describe("POST /api/trips/:tripId/group-chat/roam", () => {
  it("replies with one buffered generateText call, never streamText", async () => {
    const res = await post();
    expect(res.status).toBe(201);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock.mock.calls[0][0]).toMatchObject({ tools: {}, stopWhen: expect.anything() });
    expect(await res.json()).toMatchObject({ message: expect.objectContaining({ content: "It opens at 9am." }) });
  });

  it("runs the shared RESOLVE/RETRIEVE/COMPOSE pipeline with the unprefixed prompt", async () => {
    await post();
    expect(runAssistantTurnMock).toHaveBeenCalledWith(
      { supabase: {}, tripId: TRIP },
      expect.objectContaining({ prompt: "hey @Roam what time does this cafe open" }),
    );
  });

  it("blocks from the turn land in the persisted group_messages metadata", async () => {
    const block = { type: "place_list", places: [] };
    runAssistantTurnMock.mockResolvedValue(readyResult({ meta: { ...EMPTY_META, blocks: [block] } }));
    await post();
    expect(appendMock).toHaveBeenCalledWith(
      TRIP,
      expect.objectContaining({ userId: null, role: "assistant", metadata: expect.objectContaining({ blocks: [block] }) }),
    );
  });

  it("declined/clarify/ungrounded turns persist directly without calling the model", async () => {
    runAssistantTurnMock.mockResolvedValue({
      kind: "declined",
      resolved: { intent: "other", modelUsed: "x" },
      content: "I can't help with that.",
      meta: EMPTY_META,
      timings: { resolveMs: 3 },
    });
    const res = await post();
    expect(res.status).toBe(201);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(appendMock).toHaveBeenCalledWith(TRIP, expect.objectContaining({ content: "I can't help with that.", metadata: expect.objectContaining(EMPTY_META) }));
  });

  it("409s and never calls the model when the referenced message doesn't mention @Roam", async () => {
    listMock.mockResolvedValue([{ id: "m1", userId: "u1", role: "user", kind: "text", content: "sounds good", created_at: "2026-01-01T00:00:00Z", reactions: [] }]);
    const res = await post();
    expect(res.status).toBe(409);
    expect(runAssistantTurnMock).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("409s when the referenced message id isn't in this trip's history (e.g. it scrolled out of the window, or never existed)", async () => {
    const res = await post("does-not-exist");
    expect(res.status).toBe(409);
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("409s when the referenced message belongs to a different member — a client can't puppet someone else's mention", async () => {
    listMock.mockResolvedValue([
      { id: "m1", userId: "someone-else", role: "user", kind: "text", content: "hey @Roam what time does this cafe open", created_at: "2026-01-01T00:00:00Z", reactions: [] },
    ]);
    const res = await post();
    expect(res.status).toBe(409);
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("400s when no message id is given", async () => {
    const mod = await import("@/app/api/trips/[tripId]/group-chat/roam/route");
    const req = new Request("http://localhost/x", { method: "POST" });
    const res = await mod.POST(req, { params: Promise.resolve({ tripId: TRIP }) });
    expect(res.status).toBe(400);
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("still replies correctly when a newer, unrelated message has landed since the mention (the race a fixed last-message lookup would lose)", async () => {
    listMock.mockResolvedValue([
      { id: "m1", userId: "u1", role: "user", kind: "text", content: "hey @Roam what time does this cafe open", created_at: "2026-01-01T00:00:00Z", reactions: [] },
      { id: "m2-other", userId: "someone-else", role: "user", kind: "text", content: "lol ok", created_at: "2026-01-01T00:00:05Z", reactions: [] },
    ]);
    const res = await post("m1");
    expect(res.status).toBe(201);
    expect(runAssistantTurnMock).toHaveBeenCalledWith({ supabase: {}, tripId: TRIP }, expect.objectContaining({ prompt: "hey @Roam what time does this cafe open" }));
  });

  it("passes the same idempotency key on both the fast-path and composed reply, so a client retry upserts instead of duplicating", async () => {
    await post("m1");
    expect(appendMock).toHaveBeenCalledWith(TRIP, expect.objectContaining({ idempotencyKey: "roam-reply:m1:u1" }));
  });

  it("carries replyToMessageId on the persisted reply so the client can thread it back to what it answered", async () => {
    await post("m1");
    expect(appendMock).toHaveBeenCalledWith(TRIP, expect.objectContaining({ metadata: expect.objectContaining({ replyToMessageId: "m1" }) }));
  });

  describe("explicit trigger (the 'Ask Roam about this' message action)", () => {
    it("replies to a message that never mentioned @Roam", async () => {
      listMock.mockResolvedValue([{ id: "m1", userId: "u1", role: "user", kind: "text", content: "brunch at 11 tomorrow?", created_at: "2026-01-01T00:00:00Z", reactions: [] }]);
      const res = await post("m1", true);
      expect(res.status).toBe(201);
      expect(runAssistantTurnMock).toHaveBeenCalledWith({ supabase: {}, tripId: TRIP }, expect.objectContaining({ prompt: "brunch at 11 tomorrow?" }));
    });

    it("replies to another member's message, not just the caller's own", async () => {
      listMock.mockResolvedValue([{ id: "m1", userId: "someone-else", role: "user", kind: "text", content: "brunch at 11 tomorrow?", created_at: "2026-01-01T00:00:00Z", reactions: [] }]);
      const res = await post("m1", true);
      expect(res.status).toBe(201);
    });

    it("still 409s on a non-existent message id", async () => {
      const res = await post("does-not-exist", true);
      expect(res.status).toBe(409);
    });

    it("still 409s when targeting one of Roam's own messages", async () => {
      listMock.mockResolvedValue([{ id: "m1", userId: null, role: "assistant", kind: "text", content: "It opens at 9am.", created_at: "2026-01-01T00:00:00Z", reactions: [] }]);
      const res = await post("m1", true);
      expect(res.status).toBe(409);
    });

    it("keys idempotency per (message, asker) — two different members asking about the same message don't collide", async () => {
      listMock.mockResolvedValue([{ id: "m1", userId: "someone-else", role: "user", kind: "text", content: "brunch at 11 tomorrow?", created_at: "2026-01-01T00:00:00Z", reactions: [] }]);
      requireTripMemberMock.mockResolvedValue({ supabase: {}, user: { id: "u2" }, role: "member" });
      await post("m1", true);
      expect(appendMock).toHaveBeenCalledWith(TRIP, expect.objectContaining({ idempotencyKey: "roam-reply:m1:u2" }));
    });
  });

  it("maps an auth error", async () => {
    requireTripMemberMock.mockRejectedValue(new TripAuthError(404, "Trip not found"));
    expect((await post()).status).toBe(404);
  });

  it("503 when every model in the compose chain fails", async () => {
    generateTextMock.mockRejectedValue(new Error("provider down"));
    const res = await post();
    expect(res.status).toBe(503);
  });
});
