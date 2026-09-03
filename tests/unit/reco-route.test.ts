import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";

const insertSpy = vi.hoisted(() => vi.fn(async (_rows: Array<Record<string, unknown>>) => ({ error: null })));
const embedMock = vi.hoisted(() => vi.fn());
const classifyByEmbeddingMock = vi.hoisted(() => vi.fn());
let authThrows: unknown = null;

vi.mock("@/lib/server/trip-auth", () => ({
  requireTripMember: vi.fn(async () => {
    if (authThrows) throw authThrows;
    return { supabase: { from: () => ({ insert: insertSpy }) }, user: { id: "u1" }, role: "editor" };
  }),
  tripAuthResponse: (e: unknown) =>
    (e as { status?: number })?.status ? new Response(JSON.stringify({ error: "auth" }), { status: (e as { status: number }).status }) : null,
}));
// cached() just runs the loader (and propagates its throw, like the real SWR helper on a cold key).
vi.mock("@/lib/server/ttl-cache", () => ({ cached: (_k: string, _ttl: number, load: () => unknown) => load() }));
vi.mock("@/packages/ai/embed", async (orig) => ({
  ...(await orig<typeof import("@/packages/ai/embed")>()),
  embed: embedMock,
}));
vi.mock("@/packages/reco/classify-embed", () => ({ classifyByEmbedding: classifyByEmbeddingMock }));

import { POST } from "@/app/api/trips/[tripId]/reco/route";

const call = (body: unknown) =>
  POST(new Request("http://x/api/trips/t/reco", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ tripId: TRIP }),
  });

beforeEach(() => {
  authThrows = null;
  insertSpy.mockClear();
  embedMock.mockReset();
  classifyByEmbeddingMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/trips/:id/reco — validation", () => {
  it("400 on an unknown op", async () => {
    expect((await call({ op: "nope" })).status).toBe(400);
  });
  it("400 on a malformed classify body (missing id)", async () => {
    expect((await call({ op: "classify", name: "x" })).status).toBe(400);
  });
  it("400 when rank candidates exceed the cap of 24", async () => {
    const candidates = Array.from({ length: 25 }, (_, i) => ({ id: `c${i}`, text: "t" }));
    expect((await call({ op: "rank", anchor: "a", candidates })).status).toBe(400);
  });
  it("propagates an auth error status", async () => {
    authThrows = { status: 403 };
    expect((await call({ op: "classify", id: "p1", name: "x" })).status).toBe(403);
  });

  it("rejects a malformed JSON body without a 500", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: "{not json" }), { params: Promise.resolve({ tripId: TRIP }) });
    expect(res.status).toBeLessThan(500);
  });

  it("boundary: 24 candidates OK, name at 240 chars OK, summary at 800 OK", async () => {
    embedMock.mockResolvedValue(Array.from({ length: 25 }, () => [1, 0]));
    const candidates = Array.from({ length: 24 }, (_, i) => ({ id: `c${i}`, text: "t" }));
    expect((await call({ op: "rank", anchor: "a", candidates })).status).toBe(200);
    expect((await call({ op: "classify", id: "p", name: "x".repeat(240), summary: "s".repeat(800) })).status).toBe(200);
  });

  it("boundary: log accepts 60 events, rejects 61", async () => {
    const ev = (n: number) => Array.from({ length: n }, () => ({ laneId: "l", action: "impression" as const, itemKind: "place" as const, itemId: "i" }));
    expect((await call({ op: "log", anchorKind: "place", anchorId: "a", vibe: "v", events: ev(60) })).status).toBe(200);
    expect((await call({ op: "log", anchorKind: "place", anchorId: "a", vibe: "v", events: ev(61) })).status).toBe(400);
  });

  it("classify with hostile / prototype-y id still returns a vibe, never 500", async () => {
    for (const id of ["__proto__", "constructor", "'; DROP--", "🎪", "a".repeat(240)]) {
      const res = await call({ op: "classify", id, name: "generic tower", primaryType: "establishment" });
      expect(res.status).toBeLessThan(500);
    }
  });
});

describe("op: classify", () => {
  it("short-circuits on a sync type-map hit — no embedding call", async () => {
    const res = await call({ op: "classify", id: "p1", name: "x", primaryType: "museum" });
    expect(await res.json()).toEqual({ vibe: "museum_culture" });
    expect(classifyByEmbeddingMock).not.toHaveBeenCalled();
  });

  it("falls through to the embedding classifier for a generic type + featureless name", async () => {
    classifyByEmbeddingMock.mockResolvedValue({ vibe: "sacred", secondary: undefined });
    const res = await call({ op: "classify", id: "p2", name: "Kessapan Tower", primaryType: "tourist_attraction" });
    expect(await res.json()).toEqual({ vibe: "sacred", secondary: undefined });
    expect(classifyByEmbeddingMock).toHaveBeenCalledOnce();
  });

  it("returns the sync default (unpoisoned) when the embedding classifier yields null", async () => {
    classifyByEmbeddingMock.mockResolvedValue(null);
    const res = await call({ op: "classify", id: "p3", name: "Kessapan Tower", primaryType: "establishment" });
    expect(await res.json()).toEqual({ vibe: "default" });
  });
});

describe("op: rank", () => {
  it("returns {} for empty candidates without embedding", async () => {
    const res = await call({ op: "rank", anchor: "a", candidates: [] });
    expect(await res.json()).toEqual({ scores: {} });
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("returns per-candidate cosine against the anchor", async () => {
    // anchor ‖ c1, orthogonal to c2
    embedMock.mockResolvedValue([[1, 0], [1, 0], [0, 1]]);
    const res = await call({ op: "rank", anchor: "a", candidates: [{ id: "c1", text: "t1" }, { id: "c2", text: "t2" }] });
    const { scores } = await res.json();
    expect(scores.c1).toBeCloseTo(1);
    expect(scores.c2).toBeCloseTo(0);
  });

  it("degrades to {} when embedding throws", async () => {
    embedMock.mockRejectedValue(new Error("no credits"));
    const res = await call({ op: "rank", anchor: "a", candidates: [{ id: "c1", text: "t" }] });
    expect(await res.json()).toEqual({ scores: {} });
  });
});

describe("op: log", () => {
  it("maps events to reco_events rows and fires the insert", async () => {
    const res = await call({
      op: "log", anchorKind: "place", anchorId: "p1", vibe: "green_space",
      events: [
        { laneId: "gardens", action: "impression", itemKind: "place", itemId: "g1", position: 0 },
        { laneId: "gardens", action: "click", itemKind: "place", itemId: "g1", position: 0 },
      ],
    });
    expect(await res.json()).toEqual({ ok: true });
    expect(insertSpy).toHaveBeenCalledOnce();
    const rows = insertSpy.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      trip_id: TRIP, anchor_kind: "place", anchor_id: "p1", vibe: "green_space",
      lane_id: "gardens", action: "impression", item_kind: "place", item_id: "g1", position: 0,
    });
    expect(rows[1].action).toBe("click");
  });

  it("400 on an invalid action enum", async () => {
    const res = await call({
      op: "log", anchorKind: "place", anchorId: "p1", vibe: "x",
      events: [{ laneId: "l", action: "hover", itemKind: "place", itemId: "i" }],
    });
    expect(res.status).toBe(400);
  });
});
