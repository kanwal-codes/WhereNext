import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guard, guardedFetch, ProviderUnavailableError, resetProviderGuards } from "../../lib/server/provider-guard";

beforeEach(() => resetProviderGuards());
afterEach(() => vi.restoreAllMocks());

describe("provider circuit breaker", () => {
  it("opens after 5 consecutive failures and then fails fast without calling fn", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    for (let i = 0; i < 5; i += 1) {
      await expect(guard("p", fn)).rejects.toThrow("boom");
    }
    expect(fn).toHaveBeenCalledTimes(5);
    await expect(guard("p", fn)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(fn).toHaveBeenCalledTimes(5); // not invoked while open
  });

  it("allows a probe after the cooldown and closes on success", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    for (let i = 0; i < 5; i += 1) await expect(guard("q", fn)).rejects.toThrow("boom");
    await expect(guard("q", fn)).rejects.toBeInstanceOf(ProviderUnavailableError);

    vi.setSystemTime(1_000_000 + 20_001); // past cooldown
    fn.mockResolvedValueOnce("ok");
    await expect(guard("q", fn)).resolves.toBe("ok");
    // Breaker closed — a single later failure starts a fresh count, doesn't immediately re-open.
    await expect(guard("q", fn)).rejects.toThrow("boom");
    fn.mockResolvedValueOnce("ok2");
    await expect(guard("q", fn)).resolves.toBe("ok2");
    vi.useRealTimers();
  });

  it("does not count an AbortError as a provider failure", async () => {
    const abort = () => Promise.reject(new DOMException("Aborted", "AbortError"));
    for (let i = 0; i < 8; i += 1) {
      await expect(guard("r", abort)).rejects.toMatchObject({ name: "AbortError" });
    }
    // Still closed — the next call runs fn, it isn't short-circuited.
    await expect(guard("r", async () => "fine")).resolves.toBe("fine");
  });

  it("guardedFetch throws on upstream 5xx/429 so the breaker counts them, passes 4xx through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    for (let i = 0; i < 5; i += 1) {
      await expect(guardedFetch("s", "https://x.test")).rejects.toThrow(/503/);
    }
    await expect(guardedFetch("s", "https://x.test")).rejects.toBeInstanceOf(ProviderUnavailableError);

    resetProviderGuards();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })));
    const res = await guardedFetch("t", "https://x.test");
    expect(res.status).toBe(400); // 4xx is the provider's problem, not the breaker's
  });
});
