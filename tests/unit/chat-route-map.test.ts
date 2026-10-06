import { describe, expect, it, vi } from "vitest";
import { driveParts, transitParts } from "@/lib/application/route-path";
import { fullMapHref, legsOfRoute, mapOfHops, overlayOfRoutes, tagsOf } from "@/features/conversation/ui/panels/routeMap";
import { assistantBlockSchema } from "@/packages/contracts/assistant";
import type { RouteBlock } from "@/components/TripPanelProvider";

const line = (n: number, x0 = 0): Array<[number, number]> => Array.from({ length: n }, (_, i) => [x0 + i * 0.01, 51.5]);
const block = (over: Partial<RouteBlock> = {}): RouteBlock => ({ type: "route_summary", from: "A", to: "B", mode: "transit", durationSeconds: 1800, distanceMeters: 9000, steps: [], retrievedAt: "t", ...over });

describe("transitParts", () => {
  it("keeps each step in its own mode, joins back-to-back walks, and thins long lines", () => {
    const parts = transitParts([
      { mode: "WALK", durationSeconds: 120, polyline: line(3, 0), arrivalStop: "Gate" },
      { mode: "walk", durationSeconds: 180, polyline: line(3, 0.02), arrivalStop: "Euston" },
      { mode: "train", durationSeconds: 1200, line: "Avanti", color: "#006b58", departureStop: "Euston", arrivalStop: "Watford", polyline: line(400, 1) },
    ]);
    expect(parts.map((p) => p.mode)).toEqual(["walk", "train"]);
    expect(parts[0].minutes).toBe(5);
    expect(parts[0].to).toBe("Euston");
    expect(parts[1].path.length).toBeLessThanOrEqual(24);
    expect(parts[1].from).toBe("Euston");
  });

  it("skips steps that carry no line", () => {
    expect(transitParts([{ mode: "bus", durationSeconds: 60 }])).toEqual([]);
  });
});

describe("driveParts", () => {
  const run = (level: string, x0: number) => ({ level, polyline: line(3, x0), km: 2 });
  it("splits a drive by congestion so a jam shows on the line", () => {
    const parts = driveParts(line(9), [run("low", 0), run("heavy", 0.02), run("low", 0.04)], 30);
    expect(parts.map((p) => p.traffic)).toEqual([undefined, "heavy", undefined]);
    expect(Math.round(parts.reduce((t, p) => t + p.minutes, 0))).toBe(30);
  });
  it("draws one plain line when the road is clear", () => {
    expect(driveParts(line(9), [run("low", 0), run("low", 0.02)], 20)).toHaveLength(1);
  });
});

describe("legsOfRoute", () => {
  it("draws the real parts when the reply carried them, else the one line", () => {
    const withLegs = block({ legs: [{ mode: "walk", minutes: 4, path: line(3) }, { mode: "bus", minutes: 20, color: "d00", path: line(3, 1) }] });
    expect(legsOfRoute(withLegs).map((l) => [l.mode, l.color])).toEqual([["walk", undefined], ["bus", "#d00"]]);
    expect(legsOfRoute(block({ mode: "driving", path: line(3) }))).toEqual([{ polyline: line(3), mode: "drive" }]);
    expect(legsOfRoute(block())).toEqual([]);
  });
});

describe("tagsOf and overlayOfRoutes", () => {
  const ride = (mins: number, changes: number) => block({ durationSeconds: mins * 60, path: line(4), legs: Array.from({ length: changes + 1 }, (_, i) => ({ mode: i % 2 ? "bus" : "train", minutes: mins / (changes + 1), path: line(3, i) })) });
  it("labels the quickest and the one with fewer changes", () => {
    expect(tagsOf([ride(40, 2), ride(50, 0)])).toEqual(["fastest", "fewer-changes"]);
  });
  it("leaves routes untagged when the reply did not carry their parts", () => {
    expect(tagsOf([block(), block()])).toEqual([null, null]);
  });
  it("puts the others behind the chosen one with their time, and a ring where a ride hands over", () => {
    const a = ride(40, 2);
    const b = ride(50, 0);
    const pick = vi.fn();
    const overlay = overlayOfRoutes([a, b], a, pick);
    expect(overlay.ghosts).toHaveLength(1);
    overlay.ghosts![0].onSelect();
    expect(pick).toHaveBeenCalledWith(b);
    expect(overlay.pills!.map((p) => p.text)).toEqual(["40 min", "50 min"]);
    expect(overlay.nodes!.length).toBe(2);
  });
});

describe("fullMapHref", () => {
  it("opens Browse with the search ready, and asks to drive only for a drive", () => {
    expect(fullMapHref("t1", block({ from: "King's Cross", to: "Heathrow" }))).toBe("/trips/t1/map?browse=1&from=King%27s+Cross&to=Heathrow");
    expect(fullMapHref("t1", block({ mode: "driving" }))).toContain("modes=drive");
  });
});

describe("mapOfHops", () => {
  it("draws each hop by its steps, with its time on it", () => {
    const hop = { fromId: "a", fromName: "A", toId: "b", toName: "B", kind: "local" as const, mode: "subway" as const, minutes: 14, km: 3, fare: null, departure: null, arrival: null, polyline: line(4), note: null, alternatives: [], timeFit: null, steps: [{ mode: "walk", minutes: 3, polyline: line(2) }, { mode: "subway", minutes: 11, polyline: line(3, 1) }] };
    const { legs, overlay } = mapOfHops([hop, { ...hop, steps: [] }]);
    expect(legs.map((l) => l.mode)).toEqual(["walk", "subway", "subway"]);
    expect(overlay.pills!.map((p) => p.text)).toEqual(["14 min", "14 min"]);
  });
});

describe("route_summary contract", () => {
  it("accepts legs, and still accepts a block without them", () => {
    const ok = (extra: object) => assistantBlockSchema.safeParse({ type: "route_summary", from: "A", to: "B", mode: "transit", durationSeconds: 1, distanceMeters: 1, steps: [], retrievedAt: "t", ...extra }).success;
    expect(ok({})).toBe(true);
    expect(ok({ legs: [{ mode: "bus", minutes: 3, path: line(2) }] })).toBe(true);
    expect(ok({ legs: [{ mode: "bus", minutes: 3, path: line(41) }] })).toBe(false);
  });
});
