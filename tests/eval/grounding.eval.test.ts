import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../support/mock-supabase";

// after() needs Next's own request-scope AsyncLocalStorage, which doesn't exist when a test
// calls the route handler directly (not through Next's actual server) — run the callback
// immediately instead.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => { void cb(); },
}));
import { evidence, evidenceNames, place } from "../support/fixture-evidence";
import { extractEntities, isGrounded } from "../support/extract-entities";

/**
 * The grounding contract: an assistant turn may only name places / hotels / events that
 * appear in the retrieved evidence, and may only link URLs that appear in it. The turn's
 * blocks are built server-side from evidence (correct by construction); this exercises the
 * prose + sanitizer path against a stubbed model that deliberately misbehaves.
 */

const TRIP = "11111111-1111-4111-8111-111111111111";
const KEY = "eval-1";

const appendSpy = vi.fn(async (_t: string, _u: string, input: unknown) => ({ id: "a1", ...(input as object) }));
const loadTripContextMock = vi.fn();
const resolveTurnMock = vi.fn();
const retrieveEvidenceMock = vi.fn();
/** `compose.text` is what the fake `streamText` yields; a test may set it (or leave it null to fail loudly). */
const { compose, streamTextMock } = vi.hoisted(() => {
  const compose: { text: string | null } = { text: null };
  const streamTextMock = vi.fn(() => ({
    textStream: (async function* () {
      if (compose.text == null) throw new Error("compose.text was not set for this test");
      yield compose.text;
    })(),
    totalUsage: Promise.resolve({ inputTokens: 900, outputTokens: 40, totalTokens: 940 }),
  }));
  return { compose, streamTextMock };
});
let listRows: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => createMockSupabase({ member: { trip_id: TRIP, role: "owner" } }) }));
vi.mock("@/lib/application/trip-context", () => ({
  loadTripContext: loadTripContextMock,
  serializeTripContext: (c: unknown) => JSON.stringify(c),
  formatTripMemory: () => "nothing yet",
}));
vi.mock("@/lib/application/thread-summary", () => ({ refreshThreadSummary: vi.fn(async () => undefined) }));
vi.mock("@/lib/application/essentials", () => ({ buildEssentialsChecklist: vi.fn(async () => null) }));
vi.mock("@/lib/application/comparison", () => ({ buildComparison: vi.fn(async () => null) }));
vi.mock("@/lib/application/turn-resolver", () => ({ resolveTurn: resolveTurnMock, MAX_TOOL_CALLS: 6 }));
vi.mock("@/lib/application/retrieve", () => ({ retrieveEvidence: retrieveEvidenceMock }));
// Phase 3.2's grounding evaluator is a real model call — stubbed so this stays hermetic. The
// real regex sanitizer still runs underneath it, so this eval's own link/entity-grounding
// assertions (which depend on the real sanitizer) are unaffected.
vi.mock("@/lib/application/evaluator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/application/evaluator")>();
  const { sanitizeAssistantContent } = await import("@/lib/application/sanitize-assistant");
  return {
    ...actual,
    finalizeAssistantText: async (content: string, allowedUrls: ReadonlySet<string>, groundingText: string) => sanitizeAssistantContent(content, allowedUrls, groundingText),
  };
});
vi.mock("@/lib/server/trip-ai-queue", () => ({ withTripAiStream: (_tripId: string, _userId: string, task: () => unknown) => task() }));
vi.mock("@/packages/ai/compose-model", () => ({ composeModelChain: () => [{ model: { mock: true } }] }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal() as object), streamText: streamTextMock }));
vi.mock("@/features/conversation/infrastructure/conversationRepository", () => ({
  createConversationRepository: () => ({ list: async () => listRows, append: appendSpy }),
  scopedMessageIdempotencyKey: (role: string, key?: string) => (key ? `${role}:${key}` : null),
}));

async function turn(promptText: string) {
  const { POST } = await import("@/app/api/ai/route");
  const request = new Request("http://localhost/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tripId: TRIP, messages: [{ role: "user", content: promptText }], messageIdempotencyKey: KEY }),
  });
  const response = await POST(request, { params: Promise.resolve({}) });
  const bodyText = await new Response(response.body).text();
  await new Promise((r) => setTimeout(r, 0)); // let the persist microtask run
  const persisted = appendSpy.mock.calls.at(-1)?.[2] as { content: string; metadata: { blocks?: Array<{ type: string }> } } | undefined;
  return { status: response.status, bodyText, persisted };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  listRows = [{ role: "user", idempotency_key: `user:${KEY}`, content: "x" }];
  loadTripContextMock.mockResolvedValue({ trip: { name: "T", destination: "Montreal", origin: null, duration_days: 4, travelers: 2 }, preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], places: [], decisions: [] });
  resolveTurnMock.mockResolvedValue({
    language: "en", locationFocus: "Montreal", intent: "discovery", wantsComparison: false,
    toolPlan: [{ tool: "search_places", query: "landmarks", location: "Montreal" }],
    clarify: null, suggestedFollowups: [], proposedProfileUpdate: null,
  });
});

describe("grounding eval", () => {
  it("every entity in the reply and blocks is present in the retrieved evidence", async () => {
    const ev = evidence({ places: [place("Notre-Dame Basilica"), place("Mount Royal Park")] });
    retrieveEvidenceMock.mockResolvedValue(ev);
    listRows[0].content = "famous landmarks in Montreal";
    compose.text = "I'd start with Notre-Dame Basilica for the architecture, then walk up to Mount Royal Park for the view.";

    const { persisted } = await turn("famous landmarks in Montreal");
    const names = evidenceNames(ev);
    const mentioned = extractEntities(persisted!.content, persisted!.metadata.blocks as Array<{ type: string }> & Record<string, unknown>[]);
    for (const name of mentioned) {
      expect(isGrounded(name, names), `"${name}" is not in the evidence set [${names.join(", ")}]`).toBe(true);
    }
    expect(persisted!.metadata.blocks?.map((b) => b.type)).toContain("place_list");
  });

  it("strips a link the model invented that is not in the evidence", async () => {
    retrieveEvidenceMock.mockResolvedValue(evidence({ places: [place("Jean-Talon Market")] }));
    listRows[0].content = "where to eat";
    compose.text = "Try Jean-Talon Market. More details at http://evil.example/montreal and [here](https://phish.example).";

    const { persisted } = await turn("where to eat");
    expect(persisted!.content).not.toContain("evil.example");
    expect(persisted!.content).not.toContain("phish.example");
  });

  it("refuses without calling the model when a tool plan produced no evidence", async () => {
    retrieveEvidenceMock.mockResolvedValue(evidence()); // tool plan ran, nothing came back
    listRows[0].content = "hotels near the old port";

    const { bodyText } = await turn("hotels near the old port");
    expect(bodyText.toLowerCase()).toMatch(/couldn.?t verify|no verified|nothing/);
    expect(streamTextMock).not.toHaveBeenCalled();
  });
});
