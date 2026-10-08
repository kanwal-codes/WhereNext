import { describe, expect, it } from "vitest";
import { HttpError, clockSkewMs, restoreOutbox, sendFailure, serializeOutbox, type Outgoing } from "../../features/group-chat/domain/outbox";

describe("sendFailure", () => {
  it("explains a refusal and does not offer to retry by itself", () => {
    expect(sendFailure(new HttpError(401))).toMatchObject({ retryable: false, reason: expect.stringContaining("signed out") });
    expect(sendFailure(new HttpError(404))).toMatchObject({ retryable: false, reason: expect.stringContaining("no longer part") });
    expect(sendFailure(new HttpError(400))).toMatchObject({ retryable: false });
  });
  it("retries by itself when the connection or the server is the problem", () => {
    expect(sendFailure(new HttpError(429)).retryable).toBe(true);
    expect(sendFailure(new HttpError(503)).retryable).toBe(true);
    expect(sendFailure(new TypeError("Failed to fetch"))).toEqual({ reason: "No connection.", retryable: true });
    expect(sendFailure(new DOMException("aborted", "AbortError"))).toEqual({ reason: "It took too long.", retryable: true });
  });
});

describe("outbox persistence", () => {
  const unsent: Outgoing[] = [
    { key: "a", content: "see you at 6", status: "failed", created_at: "2026-10-08T10:00:00Z", reason: "No connection.", retryable: true },
    { key: "b", content: "on my way", status: "sending", created_at: "2026-10-08T10:01:00Z" },
  ];
  it("brings every unsent message back as failed, keeping its key (so a retry cannot post it twice)", () => {
    const back = restoreOutbox(serializeOutbox(unsent));
    expect(back.map((o) => [o.key, o.status])).toEqual([["a", "failed"], ["b", "failed"]]);
    expect(back[0].reason).toBe("No connection.");
    expect(back[1].retryable).toBe(true);
  });
  it("drops anything malformed instead of trusting it", () => {
    expect(restoreOutbox(null)).toEqual([]);
    expect(restoreOutbox("not json")).toEqual([]);
    expect(restoreOutbox(JSON.stringify({ key: "x" }))).toEqual([]);
    expect(restoreOutbox(JSON.stringify([{ key: "x", content: "   ", created_at: "t" }, { key: 1 }, null]))).toEqual([]);
  });
});

describe("clockSkewMs", () => {
  it("is how far ahead the server is", () => {
    expect(clockSkewMs("Thu, 08 Oct 2026 10:00:05 GMT", Date.parse("2026-10-08T10:00:00Z"))).toBe(5000);
    expect(clockSkewMs("Thu, 08 Oct 2026 09:58:00 GMT", Date.parse("2026-10-08T10:00:00Z"))).toBe(-120000);
  });
  it("is zero when there is no usable date", () => {
    expect(clockSkewMs(null, 1)).toBe(0);
    expect(clockSkewMs("garbage", 1)).toBe(0);
  });
});
