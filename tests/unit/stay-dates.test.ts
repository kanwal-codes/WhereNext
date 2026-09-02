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
});
