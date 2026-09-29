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

  it("fails open by default and closed for guests when the limiter itself errors", async () => {
    const { withinRateLimit } = await withBrokenRedis();
    expect(await withinRateLimit("k", 5, 1000)).toBe(true);
    expect(await withinRateLimit("k", 5, 1000, { failClosed: true })).toBe(false);
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

  it("never rate-limits or restricts a registered user", async () => {
    const limit = mockAuth({ id: "u1", is_anonymous: false });
    const { requireTripMember } = await import("@/lib/server/trip-auth");
    const member = await requireTripMember(TRIP, { registered: true });
    expect(member.guest).toBe(false);
    expect(limit).not.toHaveBeenCalled();
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
    vi.doMock("@/lib/application/parse-trip", () => ({ parseTripPrompt: async () => ({ name: "Montreal with friends", destination: "Montreal", travelerCount: 4 }) }));
    const create = vi.fn(async (_userId: string, input: { name: string }) => ({ id: "trip-1", name: input.name, destination: "Montreal" }));
    vi.doMock("@/features/trip/infrastructure/tripRepository", () => ({ createTripRepository: () => ({ create }) }));
    const limit = vi.fn(async (key: string) => (typeof opts.allow === "function" ? opts.allow(key) : (opts.allow ?? true)));
    vi.doMock("@/lib/server/rate-limit", () => ({ withinRateLimit: limit }));
    return { signInAnonymously, create, limit };
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
    expect(create).toHaveBeenCalledWith("anon-1", expect.objectContaining({ name: "Montreal with friends", destination: "Montreal", travelerCount: 4 }));
  });

  it("reuses a signed-in user and skips the guest limits entirely", async () => {
    const { signInAnonymously, create, limit } = setup({ user: { id: "u1", is_anonymous: false } });
    const res = await post({ prompt: "Rome for 5 days" });
    expect(res.status).toBe(201);
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith("u1", expect.anything());
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
