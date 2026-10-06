import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localToUtc } from "@/lib/server/timezone";
import { resetProviderGuards } from "@/lib/server/provider-guard";

const zone = (offsetSeconds: number) => new Response(JSON.stringify({ status: "OK", rawOffset: offsetSeconds, dstOffset: 0 }));

describe("localToUtc", () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test";
    resetProviderGuards();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads a wall-clock time at a place as the moment it is in UTC", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => zone(-4 * 3600)));
    // 9:00 in Toronto (UTC-4 in summer) is 13:00 UTC.
    expect(await localToUtc("2031-07-01", "09:00", [-79.38, 43.65])).toBe("2031-07-01T13:00:00.000Z");
  });

  it("is null when the lookup fails, so the caller can say it ignored the time", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "REQUEST_DENIED" }))));
    expect(await localToUtc("2031-07-02", "09:00", [-0.12, 51.5])).toBeNull();
  });
});
