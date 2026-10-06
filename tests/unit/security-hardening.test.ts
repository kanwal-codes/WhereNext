import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeHtml } from "../../lib/server/email";
import { sanitizeAssistantContent } from "../../lib/application/sanitize-assistant";
import { htmlToText } from "../../lib/server/html-text";
import { clientKey, normalizeIp } from "../../lib/server/guest";
import { availabilityInput } from "../../features/availability/domain/availability";
import { computeOverlaps } from "../../features/availability/domain/overlap";
import { cached, clearMemoryCache } from "../../lib/server/ttl-cache";
import { createPlaceRepository } from "../../features/places/infrastructure/placeRepository";
import { placeSchema } from "../../packages/contracts/place";

describe("escapeHtml (email bodies)", () => {
  it("neutralises markup in user-controlled strings", () => {
    expect(escapeHtml('<a href="https://evil.example">Reset now</a>')).toBe("&lt;a href=&quot;https://evil.example&quot;&gt;Reset now&lt;/a&gt;");
    expect(escapeHtml("Tom & Jerry's <trip>")).toBe("Tom &amp; Jerry&#39;s &lt;trip&gt;");
    expect(escapeHtml(null)).toBe("");
  });
});

describe("sanitizeAssistantContent — scheme-less www links", () => {
  const allowed = new Set(["https://www.vetted.example/page"]);
  it("strips a bare www. URL that the renderer would otherwise linkify", () => {
    expect(sanitizeAssistantContent("Book at www.attacker.example/pay now", allowed)).not.toContain("attacker");
  });
  it("keeps the www. inside a vetted https URL and a vetted URL itself", () => {
    expect(sanitizeAssistantContent("See https://www.vetted.example/page for details", allowed)).toContain("https://www.vetted.example/page");
  });
  it("still removes an unvetted https URL", () => {
    expect(sanitizeAssistantContent("Go to https://www.evil.example/x", allowed)).not.toContain("evil");
  });
});

describe("htmlToText — linear time on hostile pages", () => {
  const timeIt = (fn: () => unknown) => {
    const start = performance.now();
    fn();
    return performance.now() - start;
  };
  it("does not go quadratic on unclosed openers", () => {
    // Each of these made a previous regex rescan to the end of the input from every opener.
    expect(timeIt(() => htmlToText("<".repeat(1_000_000)))).toBeLessThan(500);
    expect(timeIt(() => htmlToText("<svg ".repeat(200_000)))).toBeLessThan(500);
    expect(timeIt(() => htmlToText("<!--".repeat(250_000)))).toBeLessThan(500);
    expect(timeIt(() => htmlToText("<script ".repeat(120_000) + "x"))).toBeLessThan(500);
  });
  it("still reads an ordinary page", () => {
    const html = "<html><head><style>p{color:red}</style><script>alert(1)</script></head><body><!-- note --><h1>Trip &amp; plan</h1><p>Day one</p><p>Day&nbsp;two<br>end</p></body></html>";
    const text = htmlToText(html);
    expect(text).toContain("Trip & plan");
    expect(text).toContain("Day one");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("note");
  });
  it("does not throw on an out-of-range numeric entity", () => {
    expect(() => htmlToText("a &#99999999; b")).not.toThrow();
  });
  it("caps its output", () => {
    expect(htmlToText("<p>" + "word ".repeat(10_000) + "</p>", 100).length).toBeLessThanOrEqual(100);
  });
});

describe("clientKey / normalizeIp", () => {
  const req = (headers: Record<string, string>) => new Request("https://example.test", { headers });
  it("collapses an IPv6 address to its /64", () => {
    expect(normalizeIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(normalizeIp("2001:db8:1:2:1111:2222:3333:4444"));
    expect(normalizeIp("2001:db8:1:2::1")).toBe(normalizeIp("2001:0db8:0001:0002:ffff:ffff:ffff:ffff"));
    expect(normalizeIp("2001:db8:1:3::1")).not.toBe(normalizeIp("2001:db8:1:2::1"));
  });
  it("leaves IPv4 alone and unwraps IPv4-mapped IPv6", () => {
    expect(normalizeIp("203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });
  it("prefers the platform-stamped address over a client-supplied x-forwarded-for", () => {
    const real = clientKey(req({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "1.1.1.1" }));
    expect(clientKey(req({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "9.9.9.9" }))).toBe(real);
    expect(clientKey(req({ "x-forwarded-for": "9.9.9.9" }))).not.toBe(real);
  });
});

describe("availability bounds", () => {
  it("rejects a range wider than about a year or outside a sane year window", () => {
    expect(availabilityInput.safeParse({ ranges: [{ startDate: "0001-01-01", endDate: "9999-12-31" }] }).success).toBe(false);
    expect(availabilityInput.safeParse({ ranges: [{ startDate: "2026-01-01", endDate: "2027-06-01" }] }).success).toBe(false);
    expect(availabilityInput.safeParse({ ranges: [{ startDate: "2026-06-10", endDate: "2026-06-24" }] }).success).toBe(true);
  });
  it("computeOverlaps skips an oversized stored range instead of walking millions of days", () => {
    const start = performance.now();
    const out = computeOverlaps([
      { userId: "a", startDate: "0001-01-01", endDate: "9999-12-31" },
      { userId: "b", startDate: "2026-06-10", endDate: "2026-06-12" },
    ]);
    expect(performance.now() - start).toBeLessThan(500);
    expect(out).toEqual([{ startDate: "2026-06-10", endDate: "2026-06-12", userIds: ["b"] }]);
  });
});

describe("ttl-cache key bound", () => {
  afterEach(() => clearMemoryCache());
  it("does not store entries under an unbounded, request-controlled key", async () => {
    let loads = 0;
    const key = "k".repeat(2_000);
    await cached(key, 60_000, async () => ++loads);
    await cached(key, 60_000, async () => ++loads);
    expect(loads).toBe(2); // loaded both times: nothing was cached
    let normal = 0;
    await cached("short-key", 60_000, async () => ++normal);
    await cached("short-key", 60_000, async () => ++normal);
    expect(normal).toBe(1);
  });
});

describe("place catalog writes are insert-only", () => {
  const place = placeSchema.parse({ provider: "google-places", providerId: "ChIJabc", name: "Attacker name", category: null, latitude: 1, longitude: 2, address: null, sourceUrl: null });
  it("never updates an existing shared row: it asks for ignoreDuplicates and links the existing id", async () => {
    const upsertCalls: Array<[unknown, { ignoreDuplicates?: boolean; onConflict?: string }]> = [];
    const catalog = {
      from: (table: string) => {
        if (table !== "places") throw new Error(table);
        return {
          upsert: (row: unknown, opts: { ignoreDuplicates?: boolean; onConflict?: string }) => {
            upsertCalls.push([row, opts]);
            return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }; // conflict -> nothing inserted
          },
          select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { id: "existing-id" }, error: null }) }) }) }),
        };
      },
    };
    const links: unknown[] = [];
    const member = {
      from: (table: string) => ({
        upsert: (row: unknown) => {
          links.push([table, row]);
          return Promise.resolve({ error: null });
        },
      }),
    };
    await createPlaceRepository(member as never, catalog as never).save("trip-1", place);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0][1].ignoreDuplicates).toBe(true);
    expect(links).toContainEqual(["trip_places", { trip_id: "trip-1", place_id: "existing-id", status: "saved" }]);
  });
  it("caps the free-text fields a client can supply", () => {
    expect(placeSchema.safeParse({ ...place, name: "x".repeat(301) }).success).toBe(false);
    expect(placeSchema.safeParse({ ...place, address: "x".repeat(601) }).success).toBe(false);
  });
});

describe("rate limiter: a backend timeout is an outage, not success", () => {
  const limitMock = vi.hoisted(() => vi.fn());
  vi.mock("@upstash/ratelimit", () => ({
    Ratelimit: class {
      static fixedWindow(limit: number, window: string) { return { limit, window }; }
      limit = limitMock;
      constructor(_opts: unknown) {}
    },
  }));
  vi.mock("@upstash/redis", () => ({ Redis: class { constructor(_opts: unknown) {} } }));

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("failClosed callers fall back to the in-memory ceiling when the library resolves success:true reason:timeout", async () => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const { withinRateLimit } = await import("../../lib/server/rate-limit");
    limitMock.mockResolvedValue({ success: true, reason: "timeout" });
    const key = `guest-timeout-${Math.random()}`;
    for (let i = 0; i < 2; i += 1) expect(await withinRateLimit(key, 2, 60_000, { failClosed: true })).toBe(true);
    expect(await withinRateLimit(key, 2, 60_000, { failClosed: true })).toBe(false);
  });
});
