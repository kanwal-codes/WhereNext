import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached, clearMemoryCache } from "@/lib/server/ttl-cache";

// `revalidateTag` needs Next's own request-scope store, which doesn't exist when a test calls
// this directly — `invalidateWorkspace` already catches that ("static generation store
// missing") and this mock just avoids the throw entirely so the test stays focused on the
// `ttl-cache` busting this file is actually responsible for.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: vi.fn() }));

const TRIP = "11111111-1111-4111-8111-111111111111";

beforeEach(() => clearMemoryCache());
afterEach(() => clearMemoryCache());

describe("invalidateWorkspace", () => {
  it("busts the trip-review findings cache, not just trip-context — a stale review used to survive every mutation for up to 10 minutes", async () => {
    const { invalidateWorkspace } = await import("@/lib/server/workspace-cache");
    const load = vi.fn(async () => "findings-v1");
    expect(await cached(`review:${TRIP}`, 600_000, load)).toBe("findings-v1");
    expect(load).toHaveBeenCalledTimes(1);

    // Still cached without a bust — same key, same TTL, loader must not run again.
    expect(await cached(`review:${TRIP}`, 600_000, load)).toBe("findings-v1");
    expect(load).toHaveBeenCalledTimes(1);

    invalidateWorkspace(TRIP);
    load.mockResolvedValue("findings-v2");
    expect(await cached(`review:${TRIP}`, 600_000, load)).toBe("findings-v2");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("still busts trip-context alongside review (existing behavior, unchanged)", async () => {
    const { invalidateWorkspace } = await import("@/lib/server/workspace-cache");
    const load = vi.fn(async () => "ctx-v1");
    await cached(`trip-context:${TRIP}`, 15_000, load);
    invalidateWorkspace(TRIP);
    load.mockResolvedValue("ctx-v2");
    expect(await cached(`trip-context:${TRIP}`, 15_000, load)).toBe("ctx-v2");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not bust a different trip's review cache", async () => {
    const { invalidateWorkspace } = await import("@/lib/server/workspace-cache");
    const otherTrip = "22222222-2222-4222-8222-222222222222";
    const load = vi.fn(async () => "other-findings");
    await cached(`review:${otherTrip}`, 600_000, load);
    invalidateWorkspace(TRIP);
    await cached(`review:${otherTrip}`, 600_000, load);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
