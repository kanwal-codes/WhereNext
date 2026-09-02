import { describe, expect, it } from "vitest";
import { cached } from "../../lib/server/ttl-cache";

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
});
