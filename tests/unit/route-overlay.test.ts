import { describe, expect, it } from "vitest";
import { congestionRuns, interchangeNodes, routeMetrics, tagRoutes, trafficSummary } from "@/lib/application/route-overlay";

const line = (n: number, x0 = 0): Array<[number, number]> => Array.from({ length: n }, (_, i) => [x0 + i * 0.01, 51.5]);

describe("interchangeNodes", () => {
  it("marks a handover between two rides, and a walk between two rides, but not a boarding or two walks", () => {
    const steps = [
      { mode: "walk", polyline: line(3, 0) },
      { mode: "subway", polyline: line(3, 1), to: "Euston" },
      { mode: "train", polyline: line(3, 2), from: "Euston", to: "Watford Junction" },
      { mode: "walk", polyline: line(3, 3) },
      { mode: "bus", polyline: line(3, 4), from: "Watford Junction" },
    ];
    const nodes = interchangeNodes(steps, "r");
    expect(nodes.map((n) => n.label)).toEqual(["Euston", "Watford Junction"]);
    expect(nodes[0].at).toEqual([2, 51.5]);
  });

  it("treats a run of walks between two rides as one change, and tidies stop names", () => {
    const steps = [
      { mode: "walk", polyline: line(2, 0) },
      { mode: "walk", polyline: line(2, 0.2) },
      { mode: "bus", polyline: line(3, 1), to: "Euston Station (Stop C)" },
      { mode: "walk", polyline: line(2, 2) },
      { mode: "walk", polyline: line(2, 2.2) },
      { mode: "walk", polyline: line(2, 2.4) },
      { mode: "train", polyline: line(3, 3), from: "Euston", to: "Watford Junction" },
    ];
    const nodes = interchangeNodes(steps, "r");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe("Euston");
    expect(nodes[0].at).toEqual([3, 51.5]);
  });

  it("marks nothing for a single ride", () => {
    expect(interchangeNodes([{ mode: "walk", polyline: line(2) }, { mode: "bus", polyline: line(2) }], "r")).toEqual([]);
  });
});

describe("congestionRuns", () => {
  it("joins neighbouring segments of one level and sums their length", () => {
    const coords = line(5);
    const runs = congestionRuns(coords, ["low", "low", "heavy", "heavy"]);
    expect(runs.map((r) => r.level)).toEqual(["low", "heavy"]);
    expect(runs[0].polyline).toHaveLength(3);
    expect(runs[1].polyline).toHaveLength(3);
    expect(runs[0].km).toBeGreaterThan(1);
  });

  it("treats a missing annotation as unknown, and says nothing about traffic it cannot see", () => {
    const runs = congestionRuns(line(4), undefined);
    expect(runs).toHaveLength(1);
    expect(runs[0].level).toBe("unknown");
    expect(trafficSummary(runs)).toBeNull();
  });
});

describe("trafficSummary", () => {
  it("reads clear, some, and heavy", () => {
    const run = (level: "low" | "moderate" | "heavy", km: number) => ({ level, km, polyline: line(2) });
    expect(trafficSummary([run("low", 30)])?.text).toBe("Clear roads");
    expect(trafficSummary([run("low", 20), run("moderate", 6)])?.text).toBe("Some traffic");
    expect(trafficSummary([run("low", 20), run("heavy", 4)])?.tone).toBe("caution");
  });
});

describe("routeMetrics and tagRoutes", () => {
  it("counts changes between rides and the minutes on foot", () => {
    expect(routeMetrics([{ mode: "walk", minutes: 6 }, { mode: "subway", minutes: 20 }, { mode: "bus", minutes: 15 }, { mode: "walk", minutes: 4 }])).toEqual({ changes: 1, walkMinutes: 10 });
  });

  it("labels the quickest, and others only where they truly beat it", () => {
    const tags = tagRoutes([
      { minutes: 50, changes: 2, walkMinutes: 14 },
      { minutes: 61, changes: 0, walkMinutes: 20 },
      { minutes: 58, changes: 2, walkMinutes: 3 },
      { minutes: 70, changes: 2, walkMinutes: 30 },
    ]);
    expect(tags).toEqual(["fastest", "fewer-changes", "least-walking", null]);
  });

  it("does not label a lone route", () => {
    expect(tagRoutes([{ minutes: 40, changes: 1, walkMinutes: 5 }])).toEqual([null]);
  });
});
