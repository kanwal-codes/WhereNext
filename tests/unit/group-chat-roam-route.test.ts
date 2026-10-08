import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// after() needs Next's own request-scope AsyncLocalStorage, which doesn't exist when a test
// calls the route handler directly (not through Next's actual server) — run the callback
// immediately instead, same as this file's own withTripAiTask mock does for testability.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => { void cb(); },
}));

const TRIP = "11111111-1111-4111-8111-111111111111";

const requireTripMemberMock = vi.fn();
const loadTripContextMock = vi.fn();
const runAssistantTurnMock = vi.fn();
const listMock = vi.fn();
const appendMock = vi.fn();
const getByIdempotencyKeyMock = vi.fn();
const getByIdMock = vi.fn();
const generateTextMock = vi.fn();
const recordAiTurnMock = vi.fn(async () => undefined);

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
    usage: [],
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
  describeMembers: () => "",
}));
vi.mock("@/lib/application/orchestrate/run-turn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/application/orchestrate/run-turn")>()),
  runAssistantTurn: runAssistantTurnMock,
}));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateText: generateTextMock }));
// Same reasoning as ai-route.test.ts: Phase 3.2's grounding evaluator is a real model call —
// stubbed so this stays hermetic; default (empty claims) preserves every existing test's
// pre-3.2 behavior exactly, since the real regex sanitizer still runs underneath it.
const evaluateGroundingMock = vi.hoisted(() => vi.fn(async () => ({ unsupportedClaims: [] as string[] })));
vi.mock("@/lib/application/evaluator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/application/evaluator")>();
  const { sanitizeAssistantContent } = await import("@/lib/application/sanitize-assistant");
  return {
    ...actual,
    finalizeAssistantText: async (
      content: string, allowedUrls: ReadonlySet<string>, groundingText: string,
      _signal?: AbortSignal, _onUsage?: unknown, _intent?: string, onUnverified?: () => void,
    ) => {
      const sanitized = sanitizeAssistantContent(content, allowedUrls, groundingText);
      const evaluation = await evaluateGroundingMock();
      if (actual.hasUnsupportedClaim(sanitized, evaluation.unsupportedClaims)) onUnverified?.();
      return sanitized;
    },
  };
});
/** A test may reassign `composeChainRef.models` to exercise a pinned vs. unpinned chain entry. */
const composeChainRef = vi.hoisted(() => ({ models: [{ model: { mock: true }, modelId: "test-model" }] as Array<{ model: unknown; modelId: string; providerOptions?: { gateway: { only: string[] } } }> }));
vi.mock("@/packages/ai/compose-model", () => ({ composeModelChain: () => composeChainRef.models }));
vi.mock("@/lib/server/trip-ai-queue", () => ({ withTripAiTask: (_tripId: string, _userId: string, task: () => unknown) => task() }));
vi.mock("@/lib/server/ai-turn-trace", () => ({ recordAiTurn: recordAiTurnMock }));
vi.mock("@/features/group-chat/infrastructure/groupChatRepository", () => ({
  createGroupChatRepository: () => ({ list: listMock, append: appendMock, getByIdempotencyKey: getByIdempotencyKeyMock, getById: getByIdMock }),
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
  composeChainRef.models = [{ model: { mock: true }, modelId: "test-model" }];
  listMock.mockResolvedValue([
    { id: "m1", userId: "u1", role: "user", kind: "text", content: "hey @Roam what time does this cafe open", created_at: "2026-01-01T00:00:00Z", reactions: [] },
  ]);
  // Direct-by-id fallback lookup, used when a target message has aged out of list()'s window —
  // defaults to "not found" so the existing does-not-exist tests still 409 without opting in.
  getByIdMock.mockResolvedValue(null);
  appendMock.mockImplementation(async (_t, input) => ({ id: "m2", userId: input.userId, role: input.role, kind: input.kind, content: input.content, created_at: "2026-01-01T00:01:00Z", reactions: [], metadata: input.metadata ?? {} }));
  getByIdempotencyKeyMock.mockResolvedValue(null);
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

  it("forwards a chain entry's providerOptions (Gateway provider pin) to generateText", async () => {
    composeChainRef.models = [{ model: { mock: true }, modelId: "test-model", providerOptions: { gateway: { only: ["cerebras"] } } }];
    await post();
    expect(generateTextMock.mock.calls[0][0]).toMatchObject({ providerOptions: { gateway: { only: ["cerebras"] } } });
  });

  it("does not pass a providerOptions key to generateText for an unpinned chain entry", async () => {
    await post();
    expect(generateTextMock.mock.calls[0][0]).not.toHaveProperty("providerOptions");
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

  it("passes surfacedEarlier from prior group-chat replies' persisted blocks, so Roam doesn't re-list the same places", async () => {
    listMock.mockResolvedValue([
      {
        id: "m0", userId: null, role: "assistant", kind: "text", content: "Try Olive et Gourmando or Modavie.",
        created_at: "2025-12-31T00:00:00Z", reactions: [],
        metadata: { blocks: [{ type: "place_list", places: [{ name: "Olive et Gourmando" }, { name: "Modavie" }] }, { type: "stays", items: [{ name: "Hotel Nelligan" }] }] },
      },
      { id: "m1", userId: "u1", role: "user", kind: "text", content: "hey @Roam what time does this cafe open", created_at: "2026-01-01T00:00:00Z", reactions: [] },
    ]);
    await post();
    expect(runAssistantTurnMock).toHaveBeenCalledWith(
      { supabase: {}, tripId: TRIP },
      expect.objectContaining({ surfacedEarlier: new Set(["Olive et Gourmando", "Modavie", "Hotel Nelligan"]) }),
    );
  });

  it("declined/clarify/ungrounded turns persist directly without calling the model", async () => {
    runAssistantTurnMock.mockResolvedValue({
      kind: "declined",
      resolved: { intent: "other", modelUsed: "x" },
      content: "I can't help with that.",
      meta: EMPTY_META,
      timings: { resolveMs: 3 },
      usage: [],
    });
    const res = await post();
    expect(res.status).toBe(201);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(appendMock).toHaveBeenCalledWith(TRIP, expect.objectContaining({ content: "I can't help with that.", metadata: expect.objectContaining(EMPTY_META) }));
    // Live-caught: this path used to return with no trace at all — an "ungrounded" reply left
    // zero record of what RESOLVE planned or which providers failed, impossible to diagnose
    // after the fact. Every outcome now gets recorded, not just the ones that reach COMPOSE.
    expect(recordAiTurnMock).toHaveBeenCalledWith(expect.anything(), TRIP, expect.objectContaining({ intent: "other", resolve_ms: 3 }));
  });

  it("persists a card lead-in as the reply with no writing-model call and no grounding check (the cards answer the lookup)", async () => {
    runAssistantTurnMock.mockResolvedValue(readyResult({ composeSkipLine: "Here are the ways to get from Toronto to Niagara Falls. Driving is quickest at 1 h 20 min.", composeSkipIsLeadIn: true }));
    evaluateGroundingMock.mockClear();
    const res = await post();
    expect(res.status).toBe(201);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(evaluateGroundingMock).not.toHaveBeenCalled();
    expect(appendMock).toHaveBeenCalledWith(TRIP, expect.objectContaining({ content: "Here are the ways to get from Toronto to Niagara Falls. Driving is quickest at 1 h 20 min." }));
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

  it("falls back to a direct lookup, and still replies, when the target has aged out of the recent-history window", async () => {
    // list() (bounded to HISTORY_LIMIT) no longer contains the target — but a direct-by-id
    // lookup still finds it, so "Ask Roam about this" on an older message doesn't 409.
    listMock.mockResolvedValue([]);
    getByIdMock.mockResolvedValue({ id: "old-message", userId: "u1", role: "user", kind: "text", content: "hey @Roam what time does this cafe open", created_at: "2025-01-01T00:00:00Z", reactions: [] });
    const res = await post("old-message");
    expect(res.status).toBe(201);
    expect(getByIdMock).toHaveBeenCalledWith(TRIP, "old-message", "u1");
    expect(runAssistantTurnMock).toHaveBeenCalled();
  });

  it("409s when the referenced message belongs to a different member — a client can't puppet someone else's mention", async () => {
    listMock.mockResolvedValue([
      { id: "m1", userId: "someone-else", role: "user", kind: "text", content: "hey @Roam what time does this cafe open", created_at: "2026-01-01T00:00:00Z", reactions: [] },
    ]);
    const res = await post();
    expect(res.status).toBe(409);
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("returns an existing reply without recomputing when one already exists for this (message, asker)", async () => {
    const existing = { id: "m2", userId: null, role: "assistant" as const, kind: "text" as const, content: "It opens at 9am.", created_at: "2026-01-01T00:01:00Z", reactions: [], metadata: { replyToMessageId: "m1" } };
    getByIdempotencyKeyMock.mockResolvedValue(existing);
    const res = await post("m1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: existing });
    // The whole point: a concurrent duplicate request must not pay for a second LLM turn, and
    // must not risk returning different text than what's actually persisted.
    expect(runAssistantTurnMock).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(appendMock).not.toHaveBeenCalled();
    expect(getByIdempotencyKeyMock).toHaveBeenCalledWith(TRIP, "assistant", "roam-reply:m1:u1");
  });

  it("recomputes a reply that was written without its planner (degraded), so 'Try again' can fix it", async () => {
    const degraded = { id: "m2", userId: null, role: "assistant" as const, kind: "text" as const, content: "From memory.", created_at: "2026-01-01T00:01:00Z", reactions: [], metadata: { replyToMessageId: "m1", degraded: true } };
    getByIdempotencyKeyMock.mockResolvedValue(degraded);
    await post("m1");
    expect(runAssistantTurnMock).toHaveBeenCalled();
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
