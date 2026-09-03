import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, cacheStats, clearMemoryCache } from "../../lib/server/ttl-cache";

afterEach(() => {
  vi.useRealTimers();
  clearMemoryCache();
});

describe("TTL cache", () => {
  it("deduplicates concurrent loads and retries after failure", async () => {
    let loads = 0;
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => { resolve = done; });
    const first = cached("cache-test-success", 10_000, async () => { loads += 1; return pending; });
    const second = cached("cache-test-success", 10_000, async () => { loads += 1; return "wrong"; });
    resolve("result");
    await expect(Promise.all([first, second])).resolves.toEqual(["result", "result"]);
    expect(loads).toBe(1);

    let failedLoads = 0;
    await expect(cached("cache-test-failure", 10_000, async () => { failedLoads += 1; throw new Error("temporary"); })).rejects.toThrow("temporary");
    await expect(cached("cache-test-failure", 10_000, async () => { failedLoads += 1; return "recovered"; })).resolves.toBe("recovered");
    expect(failedLoads).toBe(2);
  });

  it("serves a stale value and refreshes it once in the background", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    let loads = 0;
    await expect(cached("swr", 1_000, async () => { loads += 1; return `v${loads}`; })).resolves.toBe("v1");
    expect(loads).toBe(1);

    vi.setSystemTime(1_002_000); // past the 1s TTL
    // First caller past expiry gets the stale value; exactly one background refresh runs.
    await expect(cached("swr", 1_000, async () => { loads += 1; return `v${loads}`; })).resolves.toBe("v1");
    await vi.waitFor(() => expect(loads).toBe(2)); // background refresh completed

    // Next read (within the refreshed TTL window) is the new value, no extra load.
    await expect(cached("swr", 1_000, async () => { loads += 1; return "v3"; })).resolves.toBe("v2");
    expect(loads).toBe(2);
  });

  it("counts hits, misses, stale serves and refreshes", async () => {
    vi.useFakeTimers({ now: 2_000_000 });
    await cached("m", 1_000, async () => 1); // miss
    await cached("m", 1_000, async () => 2); // hit
    vi.setSystemTime(2_002_000);
    await cached("m", 1_000, async () => 3); // stale serve + refresh
    const s = cacheStats();
    expect(s.misses).toBe(1);
    expect(s.hits).toBe(1);
    expect(s.staleServes).toBe(1);
    expect(s.refreshes).toBe(1);
  });
});
