import { describe, expect, it } from "vitest";
import { reviewTrip, pendingNotifications } from "../../lib/application/trip-review";

const NOW = new Date("2026-03-01T12:00:00Z").getTime();

const base = {
  trip: { name: "T", destination: "Lisbon", origin: "Toronto", duration_days: 5, start_date: "2026-03-10", end_date: "2026-03-14", travelers: 2 },
  preferences: {} as Record<string, unknown>,
  itinerary: [] as Array<{ title: string; day_index: number; locked: boolean }>,
  places: [] as Array<{ status: string; place: null }>,
  decisions: [] as Array<{ kind: string; value: unknown; source: string; created_at: string }>,
};

describe("reviewTrip", () => {
  it("flags an empty itinerary, missing stay and missing transport for a trip 9 days out", () => {
    const ids = reviewTrip(base, NOW).map((f) => f.id);
    expect(ids).toContain("itinerary-empty");
    expect(ids).toContain("stay-missing");
    expect(ids).toContain("transport-missing");
  });

  it("clears the stay + transport findings once decisions exist", () => {
    const ctx = { ...base, decisions: [
      { kind: "stay", value: {}, source: "user", created_at: "" },
      { kind: "transport", value: {}, source: "user", created_at: "" },
    ] };
    const ids = reviewTrip(ctx, NOW).map((f) => f.id);
    expect(ids).not.toContain("stay-missing");
    expect(ids).not.toContain("transport-missing");
  });

  it("flags an overpacked day against the traveller's pace", () => {
    const ctx = {
      ...base,
      preferences: { pace: "relaxed" }, // capacity 3
      itinerary: [1, 1, 1, 1].map((d, i) => ({ title: `x${i}`, day_index: d, locked: false })),
    };
    const f = reviewTrip(ctx, NOW).find((x) => x.id === "pacing-overloaded");
    expect(f?.title).toMatch(/Day 1/);
  });

  it("flags an itinerary longer than the trip", () => {
    const ctx = { ...base, itinerary: [{ title: "late", day_index: 7, locked: false }] };
    expect(reviewTrip(ctx, NOW).map((f) => f.id)).toContain("itinerary-overflow");
  });

  it("says nothing for a far-future trip with no plan", () => {
    const ctx = { ...base, trip: { ...base.trip, start_date: "2026-09-01", end_date: "2026-09-05" } };
    expect(reviewTrip(ctx, NOW)).toEqual([]);
  });
});

describe("pendingNotifications", () => {
  const f = (id: string, severity: "info" | "warn"): import("../../lib/application/trip-review").ReviewFinding => ({
    id, kind: "itinerary", severity, title: id, detail: id,
  });

  it("keeps only warn-level findings that are neither notified nor dismissed", () => {
    const findings = [f("a", "warn"), f("b", "info"), f("c", "warn"), f("d", "warn")];
    const out = pendingNotifications(findings, new Set(["c"]), new Set(["d"]));
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });

  it("is empty when everything warn-level has already been sent", () => {
    const findings = [f("a", "warn"), f("b", "warn")];
    expect(pendingNotifications(findings, new Set(["a", "b"]), new Set())).toEqual([]);
  });
});
