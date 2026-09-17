import { afterEach, describe, expect, it, vi } from "vitest";

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static fixedWindow(limit: number, window: string) { return { limit, window }; }
    limit = limitMock;
    constructor(_opts: unknown) {}
  },
}));
vi.mock("@upstash/redis", () => ({ Redis: class { constructor(_opts: unknown) {} } }));

import { withinRateLimit } from "../../lib/server/rate-limit";

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// No UPSTASH_REDIS_REST_URL/TOKEN set at module-load time — `withinRateLimit`'s module-level
// Redis client memoizes as null on first use and stays that way for this file's lifetime, so
// these run first, against the real in-memory fallback path.
describe("withinRateLimit — in-memory fallback (no Upstash configured)", () => {
  it("allows up to the limit, then blocks within the same window", async () => {
    const key = `mem-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) expect(await withinRateLimit(key, 3, 60_000)).toBe(true);
    expect(await withinRateLimit(key, 3, 60_000)).toBe(false);
  });

  it("resets once the window elapses", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const key = `mem-reset-${Math.random()}`;
    expect(await withinRateLimit(key, 1, 1_000)).toBe(true);
    expect(await withinRateLimit(key, 1, 1_000)).toBe(false);
    vi.setSystemTime(1_002_000);
    expect(await withinRateLimit(key, 1, 1_000)).toBe(true);
  });
});

// The module-level Redis client only re-resolves env vars on a fresh module instance, so each
// test here resets the module registry and re-imports before setting UPSTASH_* — otherwise it'd
// silently reuse the `null` client memoized by the in-memory tests above.
describe("withinRateLimit — Upstash-backed", () => {
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("uses Ratelimit.limit() and respects its success flag", async () => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const { withinRateLimit: fresh } = await import("../../lib/server/rate-limit");
    limitMock.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
    expect(await fresh("k", 10, 1_000)).toBe(true);
    expect(await fresh("k", 10, 1_000)).toBe(false);
    expect(limitMock).toHaveBeenCalledWith("k");
  });

  it("fails open on a Redis/Ratelimit error — availability over strict enforcement", async () => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const { withinRateLimit: fresh } = await import("../../lib/server/rate-limit");
    limitMock.mockRejectedValue(new Error("network"));
    expect(await fresh("k", 10, 1_000)).toBe(true);
  });
});
