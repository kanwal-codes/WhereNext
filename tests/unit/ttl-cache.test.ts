import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, clearMemoryCache } from "../../lib/server/ttl-cache";

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

  it("evicts expired entries before it evicts a hot one", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    // 255 hot entries + 1 that expires almost immediately = a full cache.
    for (let i = 0; i < 255; i += 1) await cached(`hot-${i}`, 60_000, async () => i);
    await cached("stale", 1, async () => "stale");
    vi.setSystemTime(1_000_500);
    // Inserting one more must evict the expired entry, not the oldest hot one.
    await cached("newcomer", 60_000, async () => "new");
    await expect(cached("hot-0", 60_000, async () => { throw new Error("hot-0 was evicted"); })).resolves.toBe(0);
    await expect(cached("stale", 60_000, async () => "reloaded")).resolves.toBe("reloaded");
  });
});
