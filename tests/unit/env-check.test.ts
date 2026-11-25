import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const load = async () => (await import("@/lib/server/env-check")).reportEnv;
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_MAPS_API_KEY", "MAPBOX_ACCESS_TOKEN", "ANTHROPIC_API_KEY"];

beforeEach(() => {
  vi.resetModules();
  for (const key of REQUIRED) vi.stubEnv(key, key === "NEXT_PUBLIC_SUPABASE_URL" ? "http://127.0.0.1:54321" : "x");
  for (const key of ["REDIS_KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SERP_API_KEY", "EXA_API_KEY", "TAVILY_API_KEY"]) vi.stubEnv(key, "");
});
afterEach(() => vi.unstubAllEnvs());

const run = async () => {
  const warn = vi.fn();
  (await load())({ warn, error: vi.fn() });
  return (warn.mock.calls[0]?.[0] as { disabled?: string[] } | undefined)?.disabled ?? [];
};

describe("startup environment report", () => {
  it("names flights and hotels when the SerpAPI key is missing", async () => {
    expect((await run()).some((label) => label.startsWith("Google flights and hotels"))).toBe(true);
  });
  it("does not call rate limiting disabled when only Vercel's REDIS_KV_REST_API_URL is set", async () => {
    vi.stubEnv("REDIS_KV_REST_API_URL", "https://example");
    expect((await run()).some((label) => label.startsWith("shared rate limiting"))).toBe(false);
  });
  it("calls web research disabled only when both Tavily and Exa are missing", async () => {
    expect((await run()).includes("web research")).toBe(true);
    vi.stubEnv("EXA_API_KEY", "x");
    vi.resetModules();
    expect((await run()).includes("web research")).toBe(false);
  });
});
