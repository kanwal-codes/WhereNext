import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Any = Record<string, any>;
const transit = vi.hoisted(() => vi.fn());
const mapboxRoute = vi.hoisted(() => vi.fn());
const localToUtc = vi.hoisted(() => vi.fn());
const cachedKeys: string[] = [];
vi.mock("@/packages/providers/google-places/transit", () => ({ transit: (...a: unknown[]) => transit(...a) }));
vi.mock("@/packages/providers/mapbox/client", () => ({ route: (...a: unknown[]) => mapboxRoute(...a) }));
vi.mock("@/lib/server/timezone", () => ({ localToUtc: (...a: unknown[]) => localToUtc(...a) }));
vi.mock("@/lib/server/ttl-cache", () => ({ cached: (key: string, _ttl: number, load: () => Promise<unknown>) => { cachedKeys.push(key); return load(); } }));

import { planLeg, type Stop } from "../../lib/server/plan-leg";

// ~1.1 km apart; ~14 km apart; ~500 km apart (Lisbon–Madrid-ish).
const A: Stop = { id: "a", name: "Alfama", lat: 38.711, lng: -9.13 };
const NEAR: Stop = { id: "b", name: "Baixa", lat: 38.7107, lng: -9.1393 };
const MID: Stop = { id: "c", name: "Belém", lat: 38.6916, lng: -9.2160 };
const FAR: Stop = { id: "d", name: "Madrid", lat: 40.4168, lng: -3.7038 };

const transitRoute = (over: Any = {}) => ({
  durationSeconds: 1500, fare: { amount: 1.5, currency: "EUR" }, departureTime: "10:05", arrivalTime: "10:30",
  steps: [
    { mode: "walk", durationSeconds: 180, polyline: [[-9.13, 38.711], [-9.131, 38.7108]] },
    { mode: "bus", durationSeconds: 1200, line: "728", agency: "Carris", color: "#ff0000", headsign: "Belém", stopCount: 9, departureStop: "Stop A", arrivalStop: "Stop B", polyline: [[-9.131, 38.7108], [-9.2, 38.69]] },
  ],
  polyline: [[-9.13, 38.711], [-9.2, 38.69]], ...over,
});
const mapbox = (seconds: number, coords: Array<[number, number]> = [[-9.13, 38.711], [-9.2, 38.69]]) => ({ durationSeconds: seconds, geometry: { coordinates: coords } });

beforeEach(() => {
  transit.mockReset(); mapboxRoute.mockReset(); localToUtc.mockReset(); cachedKeys.length = 0;
  transit.mockResolvedValue([]);
  mapboxRoute.mockImplementation(async (input: Any) => mapbox(input.profile === "walking" ? 900 : 600));
  localToUtc.mockResolvedValue("2030-01-02T09:00:00Z");
});
afterEach(() => vi.useRealTimers());

describe("planLeg: a hop too far to route", () => {
  it("sends a hop over 120 km to the flight comparison, with a great-circle line", async () => {
    const leg = await planLeg(A, FAR, undefined);
    expect(leg).toMatchObject({ fromId: "a", fromName: "Alfama", toId: "d", toName: "Madrid", kind: "longhaul", mode: "flight", minutes: null, fare: null, departure: null, arrival: null, steps: [], alternatives: [], timeFit: null });
    expect(leg.note).toBe("Intercity hop — ask Roam to compare flights, trains and coaches.");
    expect(leg.km).toBeGreaterThan(400);
    expect(leg.polyline.length).toBeGreaterThan(10);
    expect(transit).not.toHaveBeenCalled();
    expect(mapboxRoute).not.toHaveBeenCalled();
  });

  it("calls a hop of about 125 km intercity", async () => {
    const leg = await planLeg(A, { id: "f", name: "F", lat: A.lat + 1.12, lng: A.lng }, undefined);
    expect(leg.kind).toBe("longhaul");
  });

  it("still routes a hop just under 120 km", async () => {
    const edge: Stop = { id: "e", name: "E", lat: A.lat + 1.07, lng: A.lng }; // ~119 km
    const leg = await planLeg(A, edge, undefined);
    expect(leg.kind).toBe("local");
  });
});

describe("planLeg: the ways to make the hop", () => {
  it("prefers transit and lists driving as the alternative", async () => {
    transit.mockResolvedValue([transitRoute()]);
    const leg = await planLeg(A, MID, undefined);
    expect(leg).toMatchObject({ kind: "local", mode: "bus", minutes: 25, fare: { amount: 1.5, currency: "EUR" }, departure: "10:05", arrival: "10:30", note: null });
    expect(leg.alternatives).toEqual([{ mode: "drive", minutes: 10, km: leg.km, fare: null }]);
    expect(leg.steps).toEqual([
      { mode: "walk", minutes: 3, line: undefined, agency: undefined, color: undefined, headsign: undefined, stopCount: undefined, from: undefined, to: undefined, polyline: [[-9.13, 38.711], [-9.131, 38.7108]] },
      { mode: "bus", minutes: 20, line: "728", agency: "Carris", color: "#ff0000", headsign: "Belém", stopCount: 9, from: "Stop A", to: "Stop B", polyline: [[-9.131, 38.7108], [-9.2, 38.69]] },
    ]);
    expect(leg.polyline).toEqual([[-9.13, 38.711], [-9.2, 38.69]]);
  });

  it("names the ride as the mode, or walk when the whole journey is on foot", async () => {
    transit.mockResolvedValue([transitRoute({ steps: [{ mode: "walk", durationSeconds: 600 }], polyline: [] })]);
    const leg = await planLeg(A, MID, undefined);
    expect(leg.mode).toBe("walk");
  });

  it("falls back to the steps' own lines, then a straight line, when the journey has no line", async () => {
    transit.mockResolvedValue([transitRoute({ polyline: [] })]);
    expect((await planLeg(A, MID, undefined)).polyline).toEqual([[-9.13, 38.711], [-9.131, 38.7108], [-9.131, 38.7108], [-9.2, 38.69]]);
    cachedKeys.length = 0;
    transit.mockResolvedValue([transitRoute({ polyline: [], steps: [{ mode: "bus", durationSeconds: 600 }] })]);
    const leg = await planLeg(A, { ...MID, lat: MID.lat + 0.0001 }, undefined);
    expect(leg.polyline).toEqual([[A.lng, A.lat], [MID.lng, MID.lat + 0.0001]]);
  });

  it("never reports a zero-minute hop", async () => {
    transit.mockResolvedValue([transitRoute({ durationSeconds: 10 })]);
    expect((await planLeg(A, MID, undefined)).minutes).toBe(1);
  });

  it("ignores a transit result with no steps", async () => {
    transit.mockResolvedValue([transitRoute({ steps: [] })]);
    const leg = await planLeg(A, MID, undefined);
    expect(leg.mode).toBe("drive");
    expect(leg.note).toBe("No transit route found — driving time shown.");
  });

  it("offers a walk only when it is within 3 km", async () => {
    await planLeg(A, NEAR, undefined);
    expect(mapboxRoute.mock.calls.map((c) => (c[0] as Any).profile).sort()).toEqual(["driving", "walking"]);
    mapboxRoute.mockClear(); cachedKeys.length = 0;
    await planLeg(A, MID, undefined);
    expect(mapboxRoute.mock.calls.map((c) => (c[0] as Any).profile)).toEqual(["driving"]);
  });

  it("offers no walk for a hop of about 3.5 km", async () => {
    await planLeg(A, { id: "w", name: "W", lat: A.lat + 0.0315, lng: A.lng }, undefined);
    expect(mapboxRoute.mock.calls.map((c) => (c[0] as Any).profile)).toEqual(["driving"]);
  });

  it("prefers walking to driving for a short hop, and lists both", async () => {
    const leg = await planLeg(A, NEAR, undefined);
    expect(leg.mode).toBe("walk");
    expect(leg.minutes).toBe(15);
    expect(leg.alternatives.map((a) => a.mode)).toEqual(["drive"]);
  });

  it("draws a walk or drive along the route the provider found, else a straight line", async () => {
    mapboxRoute.mockImplementation(async (input: Any) => (input.profile === "walking" ? { durationSeconds: 600, geometry: undefined } : mapbox(300, [[1, 2], [3, 4]])));
    const leg = await planLeg(A, NEAR, undefined);
    expect(leg.polyline).toEqual([[A.lng, A.lat], [NEAR.lng, NEAR.lat]]);
    expect(leg.alternatives[0]).toMatchObject({ mode: "drive" });
  });

  it("says it could not work out a route when nothing came back", async () => {
    mapboxRoute.mockRejectedValue(new Error("down"));
    transit.mockRejectedValue(new Error("down"));
    const leg = await planLeg(A, MID, undefined);
    expect(leg).toMatchObject({ kind: "local", mode: "unknown", minutes: null, note: "Couldn't work out a route for this hop.", alternatives: [], timeFit: null });
    expect(leg.polyline).toEqual([[A.lng, A.lat], [MID.lng, MID.lat]]);
  });

  it("measures the hop in kilometres to one decimal", async () => {
    const leg = await planLeg(A, MID, undefined);
    expect(leg.km).toBe(Math.round(leg.km! * 10) / 10);
    expect(leg.km).toBeGreaterThan(7);
  });
});

describe("planLeg: the rider's choice", () => {
  it("uses the saved mode when it is still available", async () => {
    transit.mockResolvedValue([transitRoute()]);
    const leg = await planLeg(A, MID, "drive");
    expect(leg.mode).toBe("drive");
    expect(leg.alternatives.map((a) => a.mode)).toEqual(["bus"]);
    expect(leg.note).toBeNull();
  });

  it("falls back to the usual pick when the saved mode is gone", async () => {
    transit.mockResolvedValue([transitRoute()]);
    expect((await planLeg(A, MID, "ferry")).mode).toBe("bus");
  });
});

describe("planLeg: time to spare", () => {
  it("checks the gap between the two stops' times against the journey", async () => {
    transit.mockResolvedValue([transitRoute()]);
    const leg = await planLeg({ ...A, time: "10:00" }, { ...MID, time: "11:00" }, undefined);
    expect(leg.timeFit).toEqual({ availableMinutes: 60, neededMinutes: 25 });
  });

  it("says nothing when either stop has no time", async () => {
    transit.mockResolvedValue([transitRoute()]);
    expect((await planLeg({ ...A, time: "10:00" }, MID, undefined)).timeFit).toBeNull();
  });
});

describe("planLeg: a day well ahead", () => {
  const future = "2099-01-02";

  it("plans from now for today or tomorrow", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await planLeg(A, MID, undefined, undefined, today);
    await planLeg(A, MID, undefined, undefined, null);
    await planLeg(A, MID, undefined, undefined, undefined);
    expect(localToUtc).not.toHaveBeenCalled();
    expect(cachedKeys.every((k) => k.endsWith(":now"))).toBe(true);
  });

  it("plans a timetable departure once the day is more than a day away", async () => {
    const dayAfterTomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await planLeg(A, MID, undefined, undefined, dayAfterTomorrow);
    expect(localToUtc).toHaveBeenCalled();
  });

  it("leaves at the first stop's own time, else 09:00, in that place's timezone", async () => {
    await planLeg({ ...A, time: "14:30" }, MID, undefined, undefined, future);
    expect(localToUtc).toHaveBeenCalledWith(future, "14:30", [A.lng, A.lat]);
    localToUtc.mockClear(); cachedKeys.length = 0;
    await planLeg(A, MID, undefined, undefined, future);
    expect(localToUtc).toHaveBeenCalledWith(future, "09:00", [A.lng, A.lat]);
  });

  it("asks the timetable for that departure and shows its clock times", async () => {
    transit.mockResolvedValue([transitRoute()]);
    const leg = await planLeg(A, MID, undefined, undefined, future);
    expect(transit).toHaveBeenCalledTimes(1);
    expect(transit.mock.calls[0][0]).toMatchObject({ departureTime: "2030-01-02T09:00:00Z" });
    expect(leg.departure).toBe("10:05");
    expect(leg.arrival).toBe("10:30");
    expect(cachedKeys[0]).toContain("2030-01-02T09:00:00Z");
  });

  it("falls back to the next departures when that day is too far out, and then leaves the clock times off", async () => {
    transit.mockImplementation(async (input: Any) => (input.departureTime ? [] : [transitRoute()]));
    const leg = await planLeg(A, MID, undefined, undefined, future);
    expect(transit).toHaveBeenCalledTimes(2);
    expect(leg.mode).toBe("bus");
    expect(leg.departure).toBeNull();
    expect(leg.arrival).toBeNull();
  });

  it("treats a timetable failure for that day like an empty one", async () => {
    transit.mockImplementation(async (input: Any) => { if (input.departureTime) throw new Error("no timetable"); return [transitRoute()]; });
    const leg = await planLeg(A, MID, undefined, undefined, future);
    expect(leg.mode).toBe("bus");
    expect(leg.departure).toBeNull();
  });

  it("plans from now when the timezone cannot be worked out", async () => {
    localToUtc.mockResolvedValue(null);
    transit.mockResolvedValue([transitRoute()]);
    const leg = await planLeg(A, MID, undefined, undefined, future);
    expect(cachedKeys[0].endsWith(":now")).toBe(true);
    expect(leg.departure).toBe("10:05");
  });
});

describe("planLeg: caching and cancelling", () => {
  it("caches options by where the hop is, and when it leaves, not by who asked", async () => {
    await planLeg(A, MID, "drive");
    await planLeg(A, MID, undefined);
    expect(cachedKeys).toEqual([cachedKeys[0], cachedKeys[0]]);
    expect(cachedKeys[0]).toBe("route-leg-options:v3:38.7110,-9.1300:38.6916,-9.2160:now");
  });

  it("passes the caller's abort signal to every provider call", async () => {
    const signal = new AbortController().signal;
    transit.mockResolvedValue([transitRoute()]);
    await planLeg(A, NEAR, undefined, signal);
    expect(transit.mock.calls[0][1]).toBe(signal);
    for (const call of mapboxRoute.mock.calls) expect(call[1]).toBe(signal);
  });
});
