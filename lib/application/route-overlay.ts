import { MODE_COLOR } from "@/lib/application/mode-visuals";

export type LngLat = [number, number];

/** A stop where one vehicle hands over to the next: drawn on the map as a ring, with the place's name. */
export type MapNode = { id: string; at: LngLat; label?: string; color: string };
/** A time or a price sitting on a route, at a fraction of the way along it. */
export type MapPill = { id: string; polyline: LngLat[]; text: string; tone?: "main" | "ghost"; at?: number; onClick?: () => void };
/** Another way to make the same trip, drawn quietly behind the chosen one. */
export type MapGhost = { id: string; polyline: LngLat[]; onSelect: () => void };
export type MapOverlay = { ghosts?: MapGhost[]; pills?: MapPill[]; nodes?: MapNode[] };

type Stepish = { mode: string; polyline?: LngLat[]; from?: string; to?: string };

const last = <T,>(list: T[]): T | undefined => list[list.length - 1];

/**
 * Where a journey changes vehicle: the end of one step where the next starts. Two walks in a row are
 * one walk, and a handover between a walk and a ride is a boarding, not a change, so only
 * ride-to-ride handovers (and ride-to-walk-to-ride, via the walk) are marked.
 */
export function interchangeNodes(rawSteps: Stepish[], idPrefix: string): MapNode[] {
  // A run of walks (a crossing, a corridor, a concourse) is one walk.
  const steps: Stepish[] = [];
  for (const st of rawSteps) {
    const prev = steps[steps.length - 1];
    if (st.mode === "walk" && prev?.mode === "walk") steps[steps.length - 1] = { ...prev, polyline: [...(prev.polyline ?? []), ...(st.polyline ?? [])], to: st.to ?? prev.to };
    else steps.push(st);
  }
  const clean = (name?: string) => name?.replace(/\s*\((?:stop|platform|bay)[^)]*\)\s*$/i, "").trim() || undefined;
  const nodes: MapNode[] = [];
  steps.forEach((b, i) => {
    if (b.mode === "walk" || i === 0) return;
    const a = steps[i - 1];
    const before = a.mode === "walk" ? steps[i - 2] : a;
    // A boarding at the start of the journey is not a change: only a ride that follows another ride (with or without a walk between).
    if (!before || before.mode === "walk") return;
    const at = (b.polyline ?? [])[0] ?? last(a.polyline ?? []);
    if (!at) return;
    nodes.push({ id: `${idPrefix}-${i}`, at, label: clean(b.from) ?? clean(before.to), color: MODE_COLOR[b.mode] ?? MODE_COLOR.transit });
  });
  return nodes;
}

const KM_PER_DEG = 111.32;
const segmentKm = (a: LngLat, b: LngLat) => {
  const dx = (b[0] - a[0]) * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180) * KM_PER_DEG;
  const dy = (b[1] - a[1]) * KM_PER_DEG;
  return Math.hypot(dx, dy);
};

export type CongestionLevel = "low" | "moderate" | "heavy" | "severe" | "unknown";
export type TrafficRun = { level: CongestionLevel; polyline: LngLat[]; km: number };

/** Mapbox gives one congestion level per segment between coordinates; this joins neighbours with the same level into runs. */
export function congestionRuns(coords: LngLat[], congestion: string[] | undefined): TrafficRun[] {
  if (coords.length < 2) return [];
  const level = (i: number): CongestionLevel => {
    const c = congestion?.[i];
    return c === "low" || c === "moderate" || c === "heavy" || c === "severe" ? c : "unknown";
  };
  const runs: TrafficRun[] = [];
  let run: TrafficRun = { level: level(0), polyline: [coords[0]], km: 0 };
  for (let i = 0; i < coords.length - 1; i++) {
    const l = level(i);
    if (l !== run.level) {
      runs.push(run);
      run = { level: l, polyline: [coords[i]], km: 0 };
    }
    run.polyline.push(coords[i + 1]);
    run.km += segmentKm(coords[i], coords[i + 1]);
  }
  runs.push(run);
  return runs;
}

/** A one-line read on the traffic: how much of the drive is slow or stopped. */
export function trafficSummary(runs: TrafficRun[]): { text: string; tone: "good" | "neutral" | "caution" } | null {
  const known = runs.filter((r) => r.level !== "unknown");
  const total = known.reduce((t, r) => t + r.km, 0);
  if (total < 1) return null;
  const share = (levels: CongestionLevel[]) => known.filter((r) => levels.includes(r.level)).reduce((t, r) => t + r.km, 0) / total;
  if (share(["heavy", "severe"]) > 0.08) return { text: "Heavy in places", tone: "caution" };
  if (share(["moderate", "heavy", "severe"]) > 0.15) return { text: "Some traffic", tone: "neutral" };
  return { text: "Clear roads", tone: "good" };
}

export type RouteMetrics = { changes: number; walkMinutes: number };

/** Changes and walking for a route's steps, after back-to-back walks are one. */
export function routeMetrics(steps: Array<{ mode: string; minutes: number }>): RouteMetrics {
  const rides = steps.filter((s) => s.mode !== "walk").length;
  return { changes: Math.max(0, rides - 1), walkMinutes: Math.round(steps.filter((s) => s.mode === "walk").reduce((t, s) => t + s.minutes, 0)) };
}

export type RouteTag = "fastest" | "fewer-changes" | "least-walking";

/**
 * What each option is best at, so a list of six routes is not six near-identical times. The quickest is "Fastest"; another
 * is only called "Fewer changes" or "Least walking" when it truly beats the quickest at that, and each route gets one label.
 */
export function tagRoutes(routes: Array<{ minutes: number } & RouteMetrics>): Array<RouteTag | null> {
  const tags: Array<RouteTag | null> = routes.map(() => null);
  if (routes.length < 2) return tags;
  const fastest = routes.reduce((best, r, i) => (r.minutes < routes[best].minutes ? i : best), 0);
  tags[fastest] = "fastest";
  const bestBy = (pick: (r: RouteMetrics) => number, beats: number) => {
    let best = -1;
    routes.forEach((r, i) => {
      if (tags[i] || pick(r) >= beats) return;
      if (best < 0 || pick(r) < pick(routes[best]) || (pick(r) === pick(routes[best]) && r.minutes < routes[best].minutes)) best = i;
    });
    return best;
  };
  const fewer = bestBy((r) => r.changes, routes[fastest].changes);
  if (fewer >= 0) tags[fewer] = "fewer-changes";
  const walk = bestBy((r) => r.walkMinutes, routes[fastest].walkMinutes);
  if (walk >= 0) tags[walk] = "least-walking";
  return tags;
}
