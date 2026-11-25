import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveStayDates } from "@/lib/application/stay-dates";

describe("resolveStayDates", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-09-02T12:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("assumes a 3-night stay six weeks out when dates are missing or in the past", () => {
    expect(resolveStayDates()).toEqual({ checkin: "2026-10-14", checkout: "2026-10-17", assumed: true });
    expect(resolveStayDates("2026-01-01", "2026-01-04")).toMatchObject({ checkin: "2026-10-14", assumed: true });
    expect(resolveStayDates("2026-09-02")).toMatchObject({ assumed: true });
  });

  it("honours a valid future pair and fixes an inverted checkout", () => {
    expect(resolveStayDates("2026-11-01", "2026-11-05")).toEqual({ checkin: "2026-11-01", checkout: "2026-11-05", assumed: false });
    expect(resolveStayDates("2026-11-01", "2026-10-30")).toEqual({ checkin: "2026-11-01", checkout: "2026-11-04", assumed: false });
  });

  it("falls back to the trip's own dates before fabricating", () => {
    expect(resolveStayDates(null, null, { checkin: "2026-12-10", checkout: "2026-12-15" })).toEqual({
      checkin: "2026-12-10",
      checkout: "2026-12-15",
      assumed: false,
    });
    // an explicit date still wins over the trip dates
    expect(resolveStayDates("2026-11-01", "2026-11-03", { checkin: "2026-12-10", checkout: "2026-12-15" })).toMatchObject({
      checkin: "2026-11-01",
      assumed: false,
    });
    // a past trip window is ignored — back to the assumed stay
    expect(resolveStayDates(null, null, { checkin: "2026-01-01", checkout: "2026-01-05" })).toMatchObject({ assumed: true });
  });
});

describe("resolveStayDates for a visitor whose date is not UTC's", () => {
  it("keeps tomorrow's check-in when UTC has already rolled over to the next day", () => {
    // 9 PM in Toronto on the 25th is 02:00 UTC on the 26th; the visitor's own today is the 25th.
    expect(resolveStayDates("2026-11-26", "2026-11-28", undefined, "2026-11-25")).toEqual({ checkin: "2026-11-26", checkout: "2026-11-28", assumed: false });
    expect(resolveStayDates(null, null, { checkin: "2026-11-26", checkout: "2026-11-30" }, "2026-11-25")).toMatchObject({ checkin: "2026-11-26", assumed: false });
  });
  it("still refuses a check-in that is not ahead of the visitor's own date", () => {
    expect(resolveStayDates("2026-11-25", "2026-11-27", undefined, "2026-11-25")).toMatchObject({ assumed: true });
  });
});
