import { describe, expect, it } from "vitest";
import { arrangeFlights, departAtParam, fitsTime, shiftWhen, whenLabel } from "@/lib/application/travel-time";

const at = (departAt: string, over: Partial<{ priceAmount: string; durationMinutes: number; stops: number; arriveAt: string }> = {}) => ({ priceAmount: "100", durationMinutes: 90, stops: 0, arriveAt: "2026-11-16T23:00:00", departAt, ...over });

describe("shiftWhen", () => {
  it("rolls over midnight in both directions", () => {
    expect(shiftWhen({ kind: "depart", date: "2026-10-06", time: "23:45" }, 30)).toEqual({ kind: "depart", date: "2026-10-07", time: "00:15" });
    expect(shiftWhen({ kind: "arrive", date: "2026-10-06", time: "00:10" }, -30)).toEqual({ kind: "arrive", date: "2026-10-05", time: "23:40" });
  });
  it("starts from the next quarter hour when no time is set", () => {
    expect(shiftWhen(null, 0, new Date(2026, 9, 6, 9, 2))).toEqual({ kind: "depart", date: "2026-10-06", time: "09:15" });
  });
});

describe("labels and params", () => {
  it("says leave now until a time is set, and plans a drive only for a departure", () => {
    expect(whenLabel(null)).toBe("Leave now");
    expect(whenLabel({ kind: "arrive", date: "2026-10-06", time: "09:00" }, "en-US")).toBe("Arrive by Tue, Oct 6 · 9:00 AM");
    expect(departAtParam({ kind: "depart", date: "2026-10-06", time: "09:00" })).toBe("2026-10-06T09:00");
    expect(departAtParam({ kind: "arrive", date: "2026-10-06", time: "09:00" })).toBeUndefined();
  });
});

describe("flights", () => {
  const when = { kind: "depart" as const, date: "2026-11-16", time: "12:00" };
  it("keeps flights that leave after, or land by, the time asked", () => {
    expect(fitsTime(at("2026-11-16T11:36:00"), when)).toBe(false);
    expect(fitsTime(at("2026-11-16T12:00:00"), when)).toBe(true);
    expect(fitsTime(at("2026-11-16T08:00:00", { arriveAt: "2026-11-16T09:30:00" }), { ...when, kind: "arrive", time: "10:00" })).toBe(true);
    expect(fitsTime(at("2026-11-16T08:00:00"), null)).toBe(true);
  });
  it("sorts, and drops connections when only non-stop is wanted", () => {
    const list = [at("2026-11-16T15:00:00", { priceAmount: "300" }), at("2026-11-16T09:00:00", { priceAmount: "120", stops: 1, durationMinutes: 400 }), at("2026-11-16T11:00:00", { priceAmount: "200", durationMinutes: 80 })];
    expect(arrangeFlights(list, "cheapest", false).map((o) => o.priceAmount)).toEqual(["120", "200", "300"]);
    expect(arrangeFlights(list, "fastest", false)[0].durationMinutes).toBe(80);
    expect(arrangeFlights(list, "earliest", false)[0].departAt).toBe("2026-11-16T09:00:00");
    expect(arrangeFlights(list, "best", true)).toHaveLength(2);
    expect(arrangeFlights(list, "best", false)).toEqual(list);
  });
});
