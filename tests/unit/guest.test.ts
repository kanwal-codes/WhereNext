import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TRIP = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});
beforeEach(() => vi.clearAllMocks());

describe("guest helpers", () => {
  it("treats only anonymous Supabase users as guests", async () => {
    const { isGuest } = await import("@/lib/server/guest");
    expect(isGuest({ is_anonymous: true })).toBe(true);
    expect(isGuest({ is_anonymous: false })).toBe(false);
    expect(isGuest({})).toBe(false);
    expect(isGuest(null)).toBe(false);
  });

  it("keys clients by a stable, non-reversible hash of the forwarded IP", async () => {
    const { clientKey } = await import("@/lib/server/guest");
    const a = clientKey(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }));
    const b = clientKey(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.7" } }));
    const c = clientKey(new Request("http://x", { headers: { "x-forwarded-for": "198.51.100.2" } }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("203");
  });
});

describe("withinRateLimit failClosed", () => {
  async function withBrokenRedis() {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    vi.doMock("@upstash/redis", () => ({ Redis: class {} }));
    class Ratelimit {
      static fixedWindow() {
        return {};
      }
      async limit() {
        throw new Error("redis down");
      }
    }
    vi.doMock("@upstash/ratelimit", () => ({ Ratelimit }));
    return import("@/lib/server/rate-limit");
  }

  it("fails open by default, and counts in memory for guests, when the limiter itself errors", async () => {
    const { withinRateLimit } = await withBrokenRedis();
    expect(await withinRateLimit("k", 5, 1000)).toBe(true);
    // Guests are not refused outright (a full Redis once locked every visitor out); they still hit a ceiling.
    for (let i = 0; i < 5; i += 1) expect(await withinRateLimit("kg", 5, 60_000, { failClosed: true })).toBe(true);
    expect(await withinRateLimit("kg", 5, 60_000, { failClosed: true })).toBe(false);
  });

  it("forgets a guest's own counters in-process, so a deleted session doesn't linger", async () => {
    const { withinRateLimit, clearRateLimits } = await import("@/lib/server/rate-limit");
    for (let i = 0; i < 5; i++) await withinRateLimit("guest-turns:g9", 5, 60_000);
    await withinRateLimit("guest-ip-turns:abc", 5, 60_000);
    expect(await withinRateLimit("guest-turns:g9", 5, 60_000)).toBe(false);
    await clearRateLimits(["guest-turns:g9"]);
    expect(await withinRateLimit("guest-turns:g9", 5, 60_000)).toBe(true);
  });

  it("asks Redis to drop each key when one is configured", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    vi.doMock("@upstash/redis", () => ({ Redis: class {} }));
    const resetUsedTokens = vi.fn(async () => undefined);
    class Ratelimit {
      static fixedWindow() {
        return {};
      }
      resetUsedTokens = resetUsedTokens;
    }
    vi.doMock("@upstash/ratelimit", () => ({ Ratelimit }));
    const { clearRateLimits } = await import("@/lib/server/rate-limit");
    await clearRateLimits(["guest-turns:g1", "guest-api:g1"]);
    expect(resetUsedTokens).toHaveBeenCalledTimes(2);
    expect(resetUsedTokens).toHaveBeenCalledWith("guest-turns:g1");
    expect(resetUsedTokens).toHaveBeenCalledWith("guest-api:g1");
  });

  it("swallows a Redis failure: the counters just expire on their own", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    vi.doMock("@upstash/redis", () => ({ Redis: class {} }));
    class Ratelimit {
      static fixedWindow() {
        return {};
      }
      async resetUsedTokens() {
        throw new Error("redis down");
      }
    }
    vi.doMock("@upstash/ratelimit", () => ({ Ratelimit }));
    const { clearRateLimits } = await import("@/lib/server/rate-limit");
    await expect(clearRateLimits(["guest-turns:g1"])).resolves.toBeUndefined();
  });

  it("counts hits in-process when no Redis is configured", async () => {
    const { withinRateLimit } = await import("@/lib/server/rate-limit");
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await withinRateLimit("unit-window", 5, 60_000, { failClosed: true }));
    expect(results).toEqual([true, true, true, true, true, false, false]);
  });
});

describe("requireTripMember for guests", () => {
  function mockAuth(user: { id: string; is_anonymous: boolean } | null, allow = true) {
    vi.doMock("@/lib/supabase/server", () => ({
      getSessionUser: async (client: { auth: { getUser: () => Promise<{ data: { user: unknown } }> } }) => (await client.auth.getUser()).data.user,
      createSupabaseServerClient: async () => ({
        auth: { getUser: async () => ({ data: { user } }) },
        from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "owner" }, error: null }) }) }) }) }),
      }),
    }));
    const limit = vi.fn(async () => allow);
    vi.doMock("@/lib/server/rate-limit", () => ({ withinRateLimit: limit }));
    return limit;
  }

  it("lets a guest into their own trip, under a fail-closed request budget", async () => {
    const limit = mockAuth({ id: "g1", is_anonymous: true });
    const { requireTripMember } = await import("@/lib/server/trip-auth");
    const member = await requireTripMember(TRIP);
    expect(member.guest).toBe(true);
    expect(limit).toHaveBeenCalledWith("guest-api:g1", expect.any(Number), expect.any(Number), { failClosed: true });
  });

  it("refuses guests on routes that require a registered account", async () => {
    mockAuth({ id: "g1", is_anonymous: true });
    const { requireTripMember } = await import("@/lib/server/trip-auth");
    await expect(requireTripMember(TRIP, { registered: true })).rejects.toMatchObject({ status: 403 });
  });

  it("answers 429 once a guest exhausts their request budget", async () => {
    mockAuth({ id: "g1", is_anonymous: true }, false);
    const { requireTripMember } = await import("@/lib/server/trip-auth");
    await expect(requireTripMember(TRIP)).rejects.toMatchObject({ status: 429 });
  });

  it("never restricts a registered user, and holds them only to the generous per-person ceilings", async () => {
    const limit = mockAuth({ id: "u1", is_anonymous: false });
    const { requireTripMember } = await import("@/lib/server/trip-auth");
    const member = await requireTripMember(TRIP, { registered: true });
    expect(member.guest).toBe(false);
    // One overall hourly ceiling, fail-open, and none of the guest keys.
    expect(limit).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith("user-api:u1", 3000, 60 * 60_000);
  });

  it("applies a route's own bucket (model or paid-provider calls) on top", async () => {
    const limit = mockAuth({ id: "u1", is_anonymous: false });
    const { requireTripMember } = await import("@/lib/server/trip-auth");
    await requireTripMember(TRIP, { limit: { bucket: "llm", max: 60 } });
    expect(limit).toHaveBeenCalledWith("user-llm:u1", 60, 60 * 60_000);
  });

  it("answers 429 once a registered user passes the ceiling", async () => {
    mockAuth({ id: "u1", is_anonymous: false }, false);
    const { requireTripMember } = await import("@/lib/server/trip-auth");
    await expect(requireTripMember(TRIP)).rejects.toMatchObject({ status: 429 });
  });
});

describe("POST /api/guest/start", () => {
  function setup(opts: { user?: { id: string; is_anonymous: boolean } | null; signInError?: boolean; allow?: boolean | ((key: string) => boolean) } = {}) {
    const signInAnonymously = vi.fn(async () =>
      opts.signInError ? { data: { user: null }, error: new Error("anonymous sign-ins disabled") } : { data: { user: { id: "anon-1", is_anonymous: true } }, error: null },
    );
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: opts.user ?? null } }), signInAnonymously } }),
    }));
    // Reading the sentence runs after the response; capture it instead of running it.
    const afterTasks: Array<() => unknown> = [];
    vi.doMock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (task: () => unknown) => afterTasks.push(task) }));
    const enrich = vi.fn(async (_supabase: unknown, _tripId: string, _prompt: string) => undefined);
    vi.doMock("@/lib/application/enrich-trip", () => ({ enrichTripFromPrompt: enrich }));
    const create = vi.fn(async (_userId: string, input: { name: string }, _options?: { opener?: boolean }) => ({ id: "trip-1", name: input.name, destination: null }));
    vi.doMock("@/features/trip/infrastructure/tripRepository", () => ({ createTripRepository: () => ({ create }) }));
    const limit = vi.fn(async (key: string) => (typeof opts.allow === "function" ? opts.allow(key) : (opts.allow ?? true)));
    vi.doMock("@/lib/server/rate-limit", () => ({ withinRateLimit: limit }));
    return { signInAnonymously, create, limit, enrich, afterTasks };
  }
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/guest/start/route");
    return POST(new Request("http://localhost/api/guest/start", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" }, body: JSON.stringify(body) }), { params: Promise.resolve({}) });
  };

  it("opens a guest session and a real draft trip for a brand-new visitor", async () => {
    const { signInAnonymously, create } = setup();
    const res = await post({ prompt: "Montreal for Bad Bunny with 3 friends", captchaToken: "tok" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ tripId: "trip-1" });
    expect(signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: "tok" } });
    // Created blank and without a greeting: the visitor's own sentence is the first message.
    expect(create).toHaveBeenCalledWith("anon-1", expect.objectContaining({ name: "Untitled trip" }), { opener: false });
  });

  it("answers as soon as the trip exists and reads the sentence afterwards", async () => {
    const { enrich, afterTasks } = setup();
    let finishReading: () => void = () => undefined;
    enrich.mockImplementationOnce(() => new Promise<undefined>((resolve) => { finishReading = () => resolve(undefined); }));
    const res = await post({ prompt: "A long weekend in Montreal" });
    expect(res.status).toBe(201);
    expect(res.headers.get("server-timing")).toContain("create-trip");
    expect(enrich).not.toHaveBeenCalled(); // nothing waited on the model
    expect(afterTasks).toHaveLength(1);
    const running = afterTasks[0]();
    expect(enrich).toHaveBeenCalledWith(expect.anything(), "trip-1", "A long weekend in Montreal");
    finishReading();
    await running;
  });

  it("never lets a failed read of the sentence surface to the visitor", async () => {
    const { enrich, afterTasks } = setup();
    enrich.mockRejectedValueOnce(new Error("gateway down"));
    expect((await post({ prompt: "Kyoto" })).status).toBe(201);
    await expect(Promise.resolve(afterTasks[0]())).resolves.toBeUndefined();
  });

  it("reuses a signed-in user and skips the guest limits entirely", async () => {
    const { signInAnonymously, create, limit } = setup({ user: { id: "u1", is_anonymous: false } });
    const res = await post({ prompt: "Rome for 5 days" });
    expect(res.status).toBe(201);
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith("u1", expect.anything(), { opener: false });
  });

  it("tells the client to fall back to sign-up when anonymous sign-ins are unavailable", async () => {
    const { create } = setup({ signInError: true });
    const res = await post({ prompt: "Kyoto in April" });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "guest_unavailable" });
    expect(create).not.toHaveBeenCalled();
  });

  it("stops an IP that has started too many guest trips, before touching auth", async () => {
    const { signInAnonymously } = setup({ allow: false });
    const res = await post({ prompt: "Kyoto in April" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "guest_busy" });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("caps how many trips one guest can open", async () => {
    const { create } = setup({ user: { id: "g1", is_anonymous: true }, allow: (key) => !key.startsWith("guest-trips:") });
    const res = await post({ prompt: "Another one" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "guest_limit" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an empty prompt", async () => {
    setup();
    expect((await post({ prompt: "   " })).status).toBe(400);
  });
});

describe("POST /api/ai for guests", () => {
  it("answers guest_limit before persisting anything once the free messages are used", async () => {
    const append = vi.fn();
    vi.doMock("@/lib/server/trip-auth", () => ({
      requireTripMember: async () => ({ supabase: {}, user: { id: "g1" }, role: "owner", guest: true }),
      tripAuthResponse: () => null,
    }));
    vi.doMock("@/lib/server/rate-limit", () => ({ withinRateLimit: async (key: string) => !key.startsWith("guest-turns:") }));
    vi.doMock("@/features/conversation/infrastructure/conversationRepository", () => ({ createConversationRepository: () => ({ append, list: async () => [] }) }));
    const { POST } = await import("@/app/api/ai/route");
    const res = await POST(
      new Request("http://localhost/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
        body: JSON.stringify({ tripId: TRIP, messages: [{ role: "user", content: "and a sixth question" }], messageIdempotencyKey: "k1" }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "guest_limit" });
    expect(append).not.toHaveBeenCalled();
  });
});

describe("blankTripFields", () => {
  beforeEach(() => vi.doUnmock("@/lib/application/enrich-trip"));
  const blank = { name: "New trip · Sep 30", destination: null, origin: null, travelers: null, duration_days: null, start_date: null, end_date: null };
  it("fills a blank trip from the read sentence", async () => {
    const { blankTripFields } = await import("@/lib/application/enrich-trip");
    expect(blankTripFields(blank, { name: "Montreal with friends", destination: "Montreal", travelerCount: 3, durationDays: 3 })).toEqual({
      name: "Montreal with friends",
      destination: "Montreal",
      travelers: 3,
      duration_days: 3,
    });
  });
  it("derives the length from a date pair and ignores an inverted one", async () => {
    const { blankTripFields } = await import("@/lib/application/enrich-trip");
    expect(blankTripFields(blank, { startDate: "2026-10-16", endDate: "2026-10-19" })).toMatchObject({ start_date: "2026-10-16", end_date: "2026-10-19", duration_days: 4 });
    expect(blankTripFields(blank, { startDate: "2026-10-19", endDate: "2026-10-16" })).toEqual({});
  });
  it("never overwrites what is already set", async () => {
    const { blankTripFields } = await import("@/lib/application/enrich-trip");
    const set = { name: "Our Lisbon trip", destination: "Lisbon", origin: "Toronto", travelers: 2, duration_days: 5, start_date: "2026-11-01", end_date: "2026-11-05" };
    expect(blankTripFields(set, { name: "Montreal", destination: "Montreal", origin: "NYC", travelerCount: 4, durationDays: 3, startDate: "2026-10-16", endDate: "2026-10-19" })).toEqual({});
  });
});
