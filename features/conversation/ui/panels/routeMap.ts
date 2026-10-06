import type { RouteBlock } from "@/components/TripPanelProvider";
import type { MapLeg, MapOverlay } from "@/components/TripMap";
import { interchangeNodes, routeMetrics, tagRoutes, type RouteMetrics, type RouteTag } from "@/lib/application/route-overlay";

/** A length of time as "26 min" or "1 h 05". */
export const minutes = (seconds: number) => {
  const m = Math.max(1, Math.round(seconds / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

const hex = (c?: string) => (c ? `#${c.replace(/^#/, "")}` : undefined);
const modeOf = (mode: string) => (mode === "walking" ? "walk" : mode === "driving" ? "drive" : mode);

/** What to draw for one route: its real parts (each in its own mode) when the reply carried them, else its one line. */
export function legsOfRoute(route: RouteBlock): MapLeg[] {
  if (route.legs?.length) return route.legs.map((l) => ({ polyline: l.path, mode: modeOf(l.mode), color: hex(l.color), traffic: l.traffic }));
  return route.path ? [{ polyline: route.path, mode: modeOf(route.mode) }] : [];
}

/** The whole line of a route, for drawing it quietly behind the chosen one and for putting its time on it. */
export const pathOfRoute = (route: RouteBlock) => route.path ?? route.legs?.flatMap((l) => l.path) ?? [];

/** Changes and minutes on foot, when the reply carried the journey part by part. */
export function metricsOf(route: RouteBlock): RouteMetrics | null {
  return route.legs?.length ? routeMetrics(route.legs.map((l) => ({ mode: l.mode, minutes: l.minutes }))) : null;
}

/** "Fastest", "Fewer changes", "Least walking" for the routes that truly are, within one set of options. */
export function tagsOf(routes: RouteBlock[]): Array<RouteTag | null> {
  const metrics = routes.map(metricsOf);
  if (metrics.some((m) => !m)) return routes.map(() => null);
  return tagRoutes(routes.map((r, i) => ({ minutes: r.durationSeconds / 60, ...metrics[i]! })));
}

// Pills on neighbouring routes would land on the same spot; spread them along each route.
const SPREAD = [0.4, 0.6, 0.5, 0.33, 0.67, 0.45];

/** The map around the chosen route: the other ways (tap one to take it), the time on each, and where the vehicle changes. */
export function overlayOfRoutes(all: RouteBlock[], chosen: RouteBlock, onSelect: (route: RouteBlock) => void): MapOverlay {
  const others = all.filter((r) => r !== chosen && pathOfRoute(r).length > 1);
  return {
    ghosts: others.map((r, i) => ({ id: `route-${i}`, polyline: pathOfRoute(r), onSelect: () => onSelect(r) })),
    pills: [
      { id: "chosen", polyline: pathOfRoute(chosen), text: minutes(chosen.durationSeconds), tone: "main" as const },
      ...others.map((r, i) => ({ id: `time-${i}`, polyline: pathOfRoute(r), text: minutes(r.durationSeconds), tone: "ghost" as const, at: SPREAD[i % SPREAD.length], onClick: () => onSelect(r) })),
    ],
    nodes: interchangeNodes((chosen.legs ?? []).map((l) => ({ mode: modeOf(l.mode), polyline: l.path, from: l.from, to: l.to })), "chosen"),
  };
}

/** A link into the full-page map with this search ready to run. */
export function fullMapHref(tripId: string, route: RouteBlock): string {
  const params = new URLSearchParams({ browse: "1", from: route.from, to: route.to, ...(route.mode === "driving" ? { modes: "drive" } : {}) });
  return `/trips/${tripId}/map?${params}`;
}

type Hop = import("@/packages/contracts/route-plan").RouteLeg;

/** A day of hops between stops, drawn: each hop in its own modes, its time on it, and where one vehicle hands over to the next. */
export function mapOfHops(hops: Hop[]): { legs: MapLeg[]; overlay: MapOverlay } {
  const legs: MapLeg[] = [];
  const pills: NonNullable<MapOverlay["pills"]> = [];
  const nodes: NonNullable<MapOverlay["nodes"]> = [];
  hops.forEach((hop, i) => {
    const steps = hop.steps.filter((s) => (s.polyline?.length ?? 0) >= 2);
    if (steps.length) legs.push(...steps.map((s) => ({ polyline: s.polyline!, mode: s.mode.toLowerCase(), color: hex(s.color) })));
    else if (hop.polyline.length >= 2) legs.push({ polyline: hop.polyline, mode: hop.mode });
    if (hop.minutes && hop.polyline.length >= 2) pills.push({ id: `hop-${i}`, polyline: hop.polyline, text: minutes(hop.minutes * 60), tone: "main" });
    nodes.push(...interchangeNodes(hop.steps.map((s) => ({ mode: s.mode.toLowerCase(), polyline: s.polyline, from: s.from, to: s.to })), `hop-${i}`));
  });
  return { legs, overlay: { pills, nodes } };
}
