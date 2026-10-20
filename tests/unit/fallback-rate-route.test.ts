import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const fallbackRateMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/application/fallback-rate", () => ({ fallbackRate: fallbackRateMock }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/email", () => ({ sendEmail: sendEmailMock }));

import { GET as ROUTE_GET } from "../../app/api/cron/fallback-rate/route";

const AUTH = { headers: { authorization: "Bearer test-secret" } };
const GET = (request: Request) => ROUTE_GET(request, { params: Promise.resolve({}) });
const req = (init: Partial<RequestInit> = {}) => new Request("http://localhost/api/cron/fallback-rate", { ...AUTH, ...init });

describe("GET /api/cron/fallback-rate", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    process.env.FALLBACK_RATE_THRESHOLD = "0.2";
    fallbackRateMock.mockReset();
    sendEmailMock.mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.FALLBACK_RATE_THRESHOLD;
    delete process.env.FALLBACK_ALERT_EMAIL;
  });

  it("rejects a request without the correct bearer token", async () => {
    const res = await GET(new Request("http://localhost/api/cron/fallback-rate"));
    expect(res.status).toBe(401);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("does not alert when the rate is under threshold", async () => {
    fallbackRateMock.mockResolvedValue({ total: 20, fallback: 1, rate: 0.05, pinnedModel: "openai/gpt-oss-120b" });
    process.env.FALLBACK_ALERT_EMAIL = "ops@example.com";
    const res = await GET(req());
    const body = await res.json();
    expect(body.breach).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("does not alert on a breach with too small a sample", async () => {
    fallbackRateMock.mockResolvedValue({ total: 3, fallback: 3, rate: 1, pinnedModel: "openai/gpt-oss-120b" });
    process.env.FALLBACK_ALERT_EMAIL = "ops@example.com";
    const res = await GET(req());
    const body = await res.json();
    expect(body.breach).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("forces a breach (rate above threshold, real sample size) and confirms the alert fires with the right recipient and numbers", async () => {
    fallbackRateMock.mockResolvedValue({ total: 10, fallback: 8, rate: 0.8, pinnedModel: "openai/gpt-oss-120b" });
    process.env.FALLBACK_ALERT_EMAIL = "ops@example.com";
    const res = await GET(req());
    const body = await res.json();
    expect(body.breach).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe("ops@example.com");
    expect(call.subject).toContain("80%");
    expect(call.text).toContain("8/10");
    expect(call.text).toContain("openai/gpt-oss-120b");
  });

  it("restoring the threshold above the real rate stops the alert from firing again", async () => {
    fallbackRateMock.mockResolvedValue({ total: 10, fallback: 8, rate: 0.8, pinnedModel: "openai/gpt-oss-120b" });
    process.env.FALLBACK_ALERT_EMAIL = "ops@example.com";
    process.env.FALLBACK_RATE_THRESHOLD = "0.9";
    const res = await GET(req());
    const body = await res.json();
    expect(body.breach).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("logs instead of throwing when a breach fires but no alert mailbox is configured", async () => {
    fallbackRateMock.mockResolvedValue({ total: 10, fallback: 8, rate: 0.8, pinnedModel: "openai/gpt-oss-120b" });
    const res = await GET(req());
    const body = await res.json();
    expect(body.breach).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("falls back to the 20% default (not 0%) when FALLBACK_RATE_THRESHOLD is present but blank", async () => {
    // A real footgun: `Number("" ?? 0.2)` is `0`, not the intended default — `""` isn't
    // nullish, so `??` never falls through to it. A rate that's genuinely under the documented
    // 20% default must NOT breach just because the env var happens to be set to an empty string
    // (e.g. added in a dashboard with no value, or copied verbatim from .env.example's blank
    // placeholder).
    process.env.FALLBACK_RATE_THRESHOLD = "";
    fallbackRateMock.mockResolvedValue({ total: 20, fallback: 1, rate: 0.05, pinnedModel: "openai/gpt-oss-120b" });
    process.env.FALLBACK_ALERT_EMAIL = "ops@example.com";
    const res = await GET(req());
    const body = await res.json();
    expect(body.breach).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("accepts a valid threshold of exactly 0 (alerts on any fallback) instead of treating it as invalid", async () => {
    process.env.FALLBACK_RATE_THRESHOLD = "0";
    fallbackRateMock.mockResolvedValue({ total: 10, fallback: 1, rate: 0.1, pinnedModel: "openai/gpt-oss-120b" });
    process.env.FALLBACK_ALERT_EMAIL = "ops@example.com";
    const res = await GET(req());
    const body = await res.json();
    expect(body.breach).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the 20% default when FALLBACK_RATE_THRESHOLD is out of the valid [0,1] range", async () => {
    process.env.FALLBACK_RATE_THRESHOLD = "1.5";
    fallbackRateMock.mockResolvedValue({ total: 10, fallback: 8, rate: 0.8, pinnedModel: "openai/gpt-oss-120b" });
    process.env.FALLBACK_ALERT_EMAIL = "ops@example.com";
    const res = await GET(req());
    const body = await res.json();
    expect(body.breach).toBe(true); // 0.8 > the 0.2 default it falls back to
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the 20% default (not disabling alerting) when FALLBACK_RATE_THRESHOLD is a typo'd non-number", async () => {
    // Number("abc") is NaN, and every `rate > NaN` comparison is `false` — a typo'd env value
    // would otherwise silently disable alerting with no error signal.
    process.env.FALLBACK_RATE_THRESHOLD = "abc";
    fallbackRateMock.mockResolvedValue({ total: 10, fallback: 8, rate: 0.8, pinnedModel: "openai/gpt-oss-120b" });
    process.env.FALLBACK_ALERT_EMAIL = "ops@example.com";
    const res = await GET(req());
    const body = await res.json();
    expect(body.breach).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("returns an error response instead of throwing when fallbackRate() itself rejects", async () => {
    fallbackRateMock.mockRejectedValue(new Error("db unreachable"));
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
