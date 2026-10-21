import { renderToStaticMarkup } from "react-dom/server";
import along from "@turf/along";
import { lineString } from "@turf/helpers";
import { MODE_ICON, STOP_CORAL, STOP_INK } from "@/lib/application/mode-visuals";
import type { MapNode, MapPill } from "@/lib/application/route-overlay";
import type { MapPin } from "@/components/TripMap";
import { pinSvg } from "@/components/tripMapLogic";
import { cn } from "@/lib/utils";

/** Mapbox positions a marker root with a transform, so the drop-in animation plays on a child. */
function droppingPin(svg: string, delayMs: number): { root: HTMLElement; inner: HTMLElement } {
  const root = document.createElement("div");
  const inner = document.createElement("span");
  inner.className = "trip-pin-drop";
  inner.style.cssText = "position:relative;display:block;";
  inner.style.animationDelay = `${delayMs}ms`;
  inner.innerHTML = svg;
  root.appendChild(inner);
  return { root, inner };
}

/** The "A" and "B" ends of a browsed route. */
export function endpointPin(label: "A" | "B", fill: string): HTMLElement {
  return droppingPin(pinSvg(fill, label), label === "A" ? 120 : 260).root;
}

/** One stop on the map: numbered when it is on the itinerary (`number`), a bed for the stay, else a coloured dot; its name rides beside it. */
export function stopPin(p: MapPin, index: number, number: number | null, kindColor: Record<MapPin["kind"], string>): HTMLElement {
  const { inner } = droppingPin(number != null ? pinSvg(STOP_CORAL, number) : p.kind === "stay" ? pinSvg(STOP_INK, "bed") : pinSvg(kindColor[p.kind], null), 120 + index * 80);
  const el = document.createElement("button");
  // No `position` here: Mapbox positions the marker root absolutely, and a relative override stacks every pin below the last.
  el.style.cssText = "display:block;border:0;background:transparent;padding:0;cursor:pointer;";
  const label = document.createElement("span");
  label.textContent = p.name;
  // Absolutely positioned so it doesn't enlarge the marker's own box — Mapbox anchors
  // ("bottom" below) against that box, and it must stay just the pin's own footprint for
  // the tip to land exactly on the coordinate.
  label.className = "trip-pin-label";
  inner.appendChild(label);
  el.appendChild(inner);
  el.title = `${p.name}${p.day != null ? ` · Day ${p.day}` : ""}`;
  if (p.href) el.onclick = () => { window.location.href = p.href!; };
  return el;
}

/** The icon for whatever vehicle the rider marker is on right now. */
export function riderIconHtml(mode: string): string {
  const Icon = MODE_ICON[mode] ?? MODE_ICON.unknown;
  return renderToStaticMarkup(<Icon className="h-4 w-4" color="#fff" strokeWidth={2} />);
}

/** A time (or a tappable "take this route") sitting on a line. */
export function pillElement(p: MapPill, index: number): HTMLElement {
  const root = document.createElement("div");
  const pill = document.createElement(p.onClick ? "button" : "span");
  pill.className = cn("trip-pill", p.tone === "ghost" && "trip-pill--ghost");
  pill.style.animationDelay = `${900 + index * 70}ms`;
  pill.textContent = p.text;
  if (p.onClick) {
    pill.setAttribute("type", "button");
    pill.setAttribute("aria-label", `Take the route that takes ${p.text}`);
    pill.onclick = (e) => { e.stopPropagation(); p.onClick?.(); };
  }
  root.appendChild(pill);
  return root;
}

/** A dot where one vehicle hands over to the next, with its name (shown only when the map is close enough). */
export function nodeElement(n: MapNode): HTMLElement {
  const root = document.createElement("div");
  const dot = document.createElement("span");
  dot.className = "trip-node";
  dot.style.setProperty("--node", n.color);
  root.appendChild(dot);
  if (n.label) {
    const label = document.createElement("span");
    label.className = "trip-node-label";
    label.textContent = n.label;
    dot.appendChild(label);
  }
  return root;
}

const PILL_SLIDES = [0, 0.05, -0.05, 0.1, -0.1, 0.15, -0.15, 0.2, -0.2, 0.28, -0.28, 0.36, -0.36];

/** Routes that share a road would stack their times on one spot: slide each pill along its own route to the nearest free place.
 *  Returns where each pill goes, in the order given. */
export function spreadPillSpots(
  placed: Array<{ line: ReturnType<typeof lineString>; km: number; at: number }>,
  project: (lngLat: [number, number]) => { x: number; y: number },
): Array<[number, number]> {
  const taken: Array<{ x: number; y: number }> = [];
  return placed.map((pl) => {
    let best: [number, number] = [0, 0];
    for (const d of PILL_SLIDES) {
      const f = Math.min(0.92, Math.max(0.08, pl.at + d));
      const lngLat = along(pl.line, pl.km * f, { units: "kilometers" }).geometry.coordinates as [number, number];
      const pt = project(lngLat);
      best = lngLat;
      if (taken.every((t) => Math.abs(t.x - pt.x) > 76 || Math.abs(t.y - pt.y) > 32)) break;
    }
    const pt = project(best);
    taken.push({ x: pt.x, y: pt.y });
    return best;
  });
}
