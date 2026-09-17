import { describe, expect, it, beforeAll, vi } from "vitest";
import { signState, verifyState } from "../../lib/server/oauth-state";

describe("oauth-state", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "test-only-key";
  });

  it("round-trips the signed payload", () => {
    const state = signState({ tripId: "trip-1", userId: "user-1" });
    const parsed = verifyState<{ tripId: string; userId: string }>(state);
    expect(parsed.tripId).toBe("trip-1");
    expect(parsed.userId).toBe("user-1");
  });

  it("rejects a tampered payload", () => {
    const state = signState({ tripId: "trip-1" });
    const [body, sig] = state.split(".");
    const tampered = `${Buffer.from(JSON.stringify({ tripId: "trip-2", ts: Date.now() })).toString("base64url")}.${sig}`;
    expect(() => verifyState(tampered)).toThrow();
  });

  it("rejects an expired state", () => {
    vi.useFakeTimers();
    const state = signState({ tripId: "trip-1" });
    vi.advanceTimersByTime(11 * 60_000);
    expect(() => verifyState(state, 10 * 60_000)).toThrow("expired");
    vi.useRealTimers();
  });
});
