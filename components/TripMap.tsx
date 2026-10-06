"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import mapboxgl from "mapbox-gl";
import { CATEGORY_HEX } from "@/lib/map-colors";
import along from "@turf/along";
import turfLength from "@turf/length";
import lineSliceAlong from "@turf/line-slice-along";
import { lineString } from "@turf/helpers";
import "mapbox-gl/dist/mapbox-gl.css";
import { MODE_COLOR, MODE_ICON, TRAFFIC_HEX, STOP_CORAL } from "@/lib/application/mode-visuals";
import type { MapOverlay } from "@/lib/application/route-overlay";
import { easeOutQuad, legLines, routeKeyFor } from "@/lib/application/route-animation";
import { cn } from "@/lib/utils";

export type MapPin = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  kind: "stay" | "eat" | "see" | "do" | "event" | "saved";
  day?: number;
  href?: string;
};
export type MapLeg = { polyline: Array<[number, number]>; mode: string; dim?: boolean; color?: string; /** Congestion on this stretch of road: painted over the drive line. */ traffic?: string };
export type { MapOverlay, MapNode, MapPill, MapGhost } from "@/lib/application/route-overlay";

/** Room the floating chrome takes from the map (px). The route is framed in what is left. */
export type MapInset = { top?: number; right?: number; bottom?: number; left?: number };

const KIND_COLOR: Record<MapPin["kind"], string> = CATEGORY_HEX;
/** Stops on the itinerary: warm ink, so coral stays the colour of "where you sleep". */
const STOP_INK = "#1b1611";
const DRAW_MS = 1200;
/** How far the cinematic camera leans back when the whole route is in view. */
const TILT = 40;

/** Basemap, warmed toward the app's own neutrals: land is warm stone, water is the lagoon, parks are sage. */
const BASE = { land: "#f7f5f2", water: "#ceecf7", waterway: "#b6e0ee", park: "#def5e8", building: "#efebe6", label: "#514c46", labelHalo: "#fdfcfa" } as const;

/** Modes drawn as a solid ribbon; the others are dotted (on foot) or dashed (across water, by air). */
const SOLID = ["subway", "tram", "train", "bus", "transit", "drive", "unknown"];
const DASHED = ["ferry", "flight"];

const modeIn = (...modes: string[]): mapboxgl.ExpressionSpecification => ["in", ["get", "mode"], ["literal", modes]];
const byMode = (values: Record<string, number>, fallback: number): mapboxgl.ExpressionSpecification =>
  ["match", ["get", "mode"], ...Object.entries(values).flatMap(([k, v]) => [k, v]), fallback] as unknown as mapboxgl.ExpressionSpecification;
const dimmed = (full: number, dim: number): mapboxgl.ExpressionSpecification => ["case", ["get", "dim"], dim, full];
/** A width that breathes with zoom: thin on a city overview, full weight when you lean in. */
const widthAt = (expr: mapboxgl.ExpressionSpecification | number): mapboxgl.ExpressionSpecification =>
  ["interpolate", ["linear"], ["zoom"], 9, ["*", 0.6, expr], 13, ["*", 1.15, expr], 17, ["*", 1.7, expr]] as unknown as mapboxgl.ExpressionSpecification;

const RIBBON = { subway: 7, tram: 7, train: 7, drive: 7.5, bus: 6, transit: 6 };

/** A map-pin teardrop whose tip is the exact coordinate (pair with `anchor: "bottom"`). */
const BED = "M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9";
function pinSvg(color: string, mark: number | string | null): string {
  const head =
    mark === "bed"
      ? `<g transform="translate(-7 -42) scale(0.58)" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${BED}"/></g>`
      : mark === null
        ? `<circle cx="0" cy="-35" r="4.5" fill="${color}"/>`
        : `<text x="0" y="-30.5" text-anchor="middle" font-size="13" font-weight="700" font-family="Outfit, system-ui, sans-serif" fill="${color}">${mark}</text>`;
  return `<svg width="32" height="46" viewBox="-19 -55 38 56" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;filter:drop-shadow(0 7px 6px rgb(27 22 17 / 0.30))">
    <path d="M0 0C-9-14-19-22-19-35A19 19 0 1 1 19-35C19-22 9-14 0 0Z" fill="${color}" stroke="white" stroke-width="3" paint-order="stroke"/>
    <circle cx="0" cy="-35" r="10" fill="white"/>
    ${head}
  </svg>`;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const bearingBetween = (a: number[], b: number[]) => {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) - Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
/** The short way round from one compass bearing to another, so the camera never spins the long way. */
const turnToward = (from: number, to: number, k: number) => from + ((((to - from) % 360) + 540) % 360 - 180) * k;

/** The Mapbox control that frames the whole route again after the reader has wandered off. */
class FitControl implements mapboxgl.IControl {
  private box: HTMLDivElement | null = null;
  constructor(private readonly onFit: () => void) {}
  onAdd() {
    const box = document.createElement("div");
    box.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Fit the route";
    btn.setAttribute("aria-label", "Fit the route");
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin:auto"><circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2"/></svg>`;
    btn.onclick = this.onFit;
    box.appendChild(btn);
    this.box = box;
    return box;
  }
  onRemove() {
    this.box?.remove();
    this.box = null;
  }
}

/** Interactive trip map: numbered markers by type, the real route through them, and motion. */
export function TripMap({
  pins,
  legs,
  activeDay,
  center,
  browse,
  connect = true,
  inset,
  fitControl = false,
  scaleBar = false,
  cinematic = false,
  preview = false,
  onPreviewChange,
  overlay,
  className,
}: {
  pins: MapPin[];
  legs?: MapLeg[];
  activeDay: number | "all";
  /** Fallback view when there are no pins. */
  center?: [number, number];
  /** Ad-hoc A→B route (Browse mode) — drawn instead of the itinerary, with A/B markers. */
  browse?: { legs: MapLeg[]; from?: string; to?: string } | null;
  /** Draw a line through the pins when there are no legs. Off for an unordered set (a list of places). */
  connect?: boolean;
  /** Floating chrome over the map (a side panel, a sheet): the route is framed in the space that is left. */
  inset?: MapInset;
  /** Adds a "fit the route" button under the zoom buttons. */
  fitControl?: boolean;
  /** A distance scale in the corner (always on in the cinematic map). */
  scaleBar?: boolean;
  /** The full-page map: a tilted camera, 3D buildings, and a "preview the route" fly-through. */
  cinematic?: boolean;
  /** The camera is flying the route (controlled: the page's own button and the map's share it). */
  preview?: boolean;
  onPreviewChange?: (on: boolean) => void;
  /** Other ways to make the trip (drawn quietly behind), times on routes, and where one vehicle hands over to the next. */
  overlay?: MapOverlay;
  className?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const pulseMarker = useRef<mapboxgl.Marker | null>(null);
  const pulseMode = useRef<string>("");
  const raf = useRef<number>(0);
  const drawState = useRef<{ key: string; startedAt: number }>({ key: "", startedAt: 0 });
  const framed = useRef<mapboxgl.LngLatBounds | null>(null);
  const insetRef = useRef<MapInset | undefined>(inset);
  const fitRef = useRef<() => void>(() => {});
  const previewRef = useRef(false);
  const arrived = useRef(false);
  const labelsRef = useRef<() => void>(() => {});
  const extraMarkers = useRef<mapboxgl.Marker[]>([]);
  const ghostSelect = useRef<Map<string, () => void>>(new Map());
  const nodeLabelsRef = useRef<() => void>(() => {});
  const pillsRef = useRef<() => void>(() => {});
  const onPreviewRef = useRef(onPreviewChange);
  const scaleRef = useRef(scaleBar);
  scaleRef.current = scaleBar;
  const cinematicRef = useRef(cinematic);
  const [hasRoute, setHasRoute] = useState(false);
  onPreviewRef.current = onPreviewChange;
  cinematicRef.current = cinematic;
  previewRef.current = preview;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const fail = (why: unknown) => {
    console.error("[TripMap] the map could not start", why);
    setFailed(true);
  };
  // Bumped after a live theme swap (`setStyle` wipes the map's custom sources) so the data-paint
  // effect below re-runs and redraws pins/legs even though none of its own props changed.
  const [styleVersion, setStyleVersion] = useState(0);
  insetRef.current = inset;
  const insetKey = `${inset?.top ?? 0}/${inset?.right ?? 0}/${inset?.bottom ?? 0}/${inset?.left ?? 0}`;

  useEffect(() => {
    let cancelled = false;

    const warm = (m: mapboxgl.Map, dark: boolean) => {
      if (dark) return;
      const set = (id: string, prop: string, value: unknown) => {
        try { m.setPaintProperty(id, prop as "fill-color", value as string); } catch { /* this layer is not in this style version */ }
      };
      for (const layer of m.getStyle()?.layers ?? []) {
        const { id, type } = layer;
        if (type === "background") set(id, "background-color", BASE.land);
        else if (id === "land") set(id, "background-color", BASE.land);
        else if (type === "fill" && /^water$|^water-/.test(id)) set(id, "fill-color", BASE.water);
        else if (type === "line" && /^waterway/.test(id)) set(id, "line-color", BASE.waterway);
        else if (type === "fill" && /landcover|national-park|landuse|park/.test(id)) set(id, "fill-color", BASE.park);
        else if (type === "fill" && id === "building") set(id, "fill-color", BASE.building);
        else if (type === "symbol" && /settlement|road-label|natural-point|water/.test(id)) {
          set(id, "text-color", BASE.label);
          set(id, "text-halo-color", BASE.labelHalo);
        } else if (type === "symbol" && /poi-label|transit-label/.test(id)) set(id, "text-opacity", 0.7);
      }
    };

    // Custom sources/layers don't reliably survive `setStyle()` across a full basemap swap
    // (dark-v11 <-> light-v11), so this re-adds them idempotently — called on the initial
    // style load AND every subsequent one (a live theme-toggle triggers another `style.load`).
    const addLayers = (m: mapboxgl.Map) => {
      if (m.getSource("legs")) return;
      m.addSource("legs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      const color: mapboxgl.ExpressionSpecification = ["get", "color"];
      const round = { "line-cap": "round", "line-join": "round" } as const;
      const butt = { "line-cap": "butt", "line-join": "round" } as const;

      // Cinematic: buildings rise out of the map when the camera leans in, lit warm from the upper left.
      if (cinematicRef.current && !m.getLayer("trip-3d")) {
        try {
          const firstLabel = m.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
          m.addLayer({
            id: "trip-3d",
            type: "fill-extrusion",
            source: "composite",
            "source-layer": "building",
            minzoom: 13.6,
            filter: ["==", ["get", "extrude"], "true"],
            paint: {
              "fill-extrusion-color": "#e8e2da",
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-base": ["get", "min_height"],
              "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 13.6, 0, 14.8, 0.86],
              "fill-extrusion-vertical-gradient": true,
            },
          }, firstLabel);
          m.setLight({ anchor: "viewport", color: "#fff3e4", intensity: 0.42, position: [1.25, 215, 38] });
        } catch { /* a style without a building layer */ }
      }

      // Other ways to get there: a quiet line behind the chosen one, with a wide invisible stroke to make it easy to hit.
      m.addSource("ghosts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "ghost-casing", type: "line", source: "ghosts", layout: round, paint: { "line-color": "#ffffff", "line-width": widthAt(9.5), "line-opacity": 0.8 } });
      m.addLayer({ id: "ghost-line", type: "line", source: "ghosts", layout: round, paint: { "line-color": "#bdb6ad", "line-width": widthAt(4.6), "line-opacity": 0.95 } });
      m.addLayer({ id: "ghost-hit", type: "line", source: "ghosts", layout: round, paint: { "line-color": "#000000", "line-width": 22, "line-opacity": 0 } });

      // A soft light under everything, so a route glows off the map instead of lying on it.
      m.addLayer({ id: "legs-glow", type: "line", source: "legs", layout: round, paint: { "line-color": color, "line-width": widthAt(dimmed(16, 6) as mapboxgl.ExpressionSpecification), "line-opacity": dimmed(0.22, 0.08), "line-blur": 8 } });
      // White casing: the edge that lifts a ribbon off roads of any colour.
      m.addLayer({ id: "legs-casing", type: "line", source: "legs", filter: modeIn(...SOLID), layout: round, paint: { "line-color": "#ffffff", "line-width": widthAt(["*", ["+", byMode(RIBBON, 6), 5], dimmed(1, 0.55)] as unknown as mapboxgl.ExpressionSpecification), "line-opacity": dimmed(0.96, 0.5) } });
      // Dots, dashes and dashes-across-water get a plain white halo so they stay readable over streets.
      m.addLayer({ id: "legs-halo", type: "line", source: "legs", filter: ["!", modeIn(...SOLID)] as mapboxgl.ExpressionSpecification, layout: round, paint: { "line-color": "#ffffff", "line-width": widthAt(dimmed(9.5, 5)), "line-opacity": dimmed(0.88, 0.4) } });
      m.addLayer({ id: "legs", type: "line", source: "legs", filter: modeIn(...SOLID), layout: round, paint: { "line-color": color, "line-width": widthAt(["*", byMode(RIBBON, 6), dimmed(1, 0.55)] as unknown as mapboxgl.ExpressionSpecification), "line-opacity": dimmed(1, 0.4) } });
      // On foot: dots.
      // Congestion: amber where it slows, red where it stops, painted inside the drive ribbon.
      m.addLayer({ id: "legs-traffic", type: "line", source: "legs", filter: ["in", ["get", "traffic"], ["literal", ["moderate", "heavy", "severe"]]], layout: butt, paint: { "line-color": ["match", ["get", "traffic"], "moderate", TRAFFIC_HEX.slow, "heavy", TRAFFIC_HEX.heavy, "severe", TRAFFIC_HEX.severe, TRAFFIC_HEX.slow], "line-width": widthAt(dimmed(5.6, 3)), "line-opacity": dimmed(1, 0.4) } });
      m.addLayer({ id: "legs-walk", type: "line", source: "legs", filter: modeIn("walk"), layout: round, paint: { "line-color": color, "line-width": widthAt(dimmed(4.6, 3)), "line-opacity": dimmed(1, 0.45), "line-dasharray": [0.01, 2.3] } });
      // Over water or by air: dashes.
      m.addLayer({ id: "legs-dashed", type: "line", source: "legs", filter: modeIn(...DASHED), layout: butt, paint: { "line-color": color, "line-width": widthAt(dimmed(5, 3)), "line-opacity": dimmed(1, 0.45), "line-dasharray": [2, 1.5] } });
      // The texture inside the ribbon says which vehicle it is: rail ties, bus stops, tram rails.
      m.addLayer({ id: "legs-ties", type: "line", source: "legs", filter: modeIn("train"), layout: butt, paint: { "line-color": "#ffffff", "line-width": widthAt(dimmed(2.4, 1.4)), "line-opacity": dimmed(0.95, 0.4), "line-dasharray": [1.3, 1.3] } });
      m.addLayer({ id: "legs-stops", type: "line", source: "legs", filter: modeIn("bus", "transit"), layout: round, paint: { "line-color": "#ffffff", "line-width": widthAt(dimmed(2.8, 1.6)), "line-opacity": dimmed(0.95, 0.4), "line-dasharray": [0.01, 3.4] } });
      m.addLayer({ id: "legs-rails", type: "line", source: "legs", filter: modeIn("tram"), layout: round, paint: { "line-color": "#ffffff", "line-width": widthAt(dimmed(2, 1.2)), "line-opacity": dimmed(0.95, 0.4) } });
    };
    const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    const styleFor = (dark: boolean) => (dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11");

    let observer: MutationObserver | null = null;

    fetch("/api/config/mapbox")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no token"))))
      .then(({ token }) => {
        if (cancelled || !holder.current || map.current) return;
        mapboxgl.accessToken = token;
        const start: [number, number] = pins[0] ? [pins[0].lng, pins[0].lat] : center ?? [0, 20];
        const m = new mapboxgl.Map({
          container: holder.current,
          style: styleFor(isDark()),
          center: start,
          zoom: pins.length || center ? 11 : 1.4,
          attributionControl: false,
          // The panel covers the default bottom-left; the wordmark must stay visible.
          logoPosition: "bottom-right",
        });
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        if (fitControl) m.addControl(new FitControl(() => fitRef.current()), "top-right");
        if (cinematicRef.current || scaleRef.current) m.addControl(new mapboxgl.ScaleControl({ maxWidth: 88, unit: "metric" }), "bottom-right");
        // Another route is chosen by tapping its line.
        m.on("click", "ghost-hit", (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) ghostSelect.current.get(id)?.();
        });
        m.on("mouseenter", "ghost-hit", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "ghost-hit", () => { m.getCanvas().style.cursor = ""; });
        let styleLoaded = false;
        m.on("error", (e) => {
          // Only a map that never got its style is dead; a missed tile or sprite is not.
          if (!styleLoaded) fail(e.error);
        });
        m.on("style.load", () => {
          styleLoaded = true;
          warm(m, isDark());
          addLayers(m);
          setStyleVersion((v) => v + 1);
        });
        // Touching the map takes the controls back from a fly-through.
        const stopFlight = () => {
          if (previewRef.current) {
            previewRef.current = false;
            onPreviewRef.current?.(false);
          }
        };
        for (const ev of ["mousedown", "touchstart", "wheel"] as const) m.on(ev, stopFlight);
        m.on("load", () => {
          if (!cancelled) {
            map.current = m;
            setReady(true);
            requestAnimationFrame(() => m.resize());
          }
        });

        // Follow the in-app ThemeToggle (a `dark` class on <html>, no matchMedia involved)
        // rather than only the OS preference read once at construction.
        let lastDark = isDark();
        observer = new MutationObserver(() => {
          const dark = isDark();
          if (dark === lastDark) return;
          lastDark = dark;
          // `diff: false` forces a clean style swap rather than relying on undocumented diffing
          // behavior to preserve our custom sources — `addLayers` re-adds them on `style.load`.
          // The mapbox-gl type for this option is overly strict (marks unrelated font fields as
          // required), so this needs a cast.
          m.setStyle(styleFor(dark), { diff: false } as Parameters<typeof m.setStyle>[1]);
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      })
      .catch(fail);

    const ro = holder.current ? new ResizeObserver(() => map.current?.resize()) : null;
    if (ro && holder.current) ro.observe(holder.current);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
      ro?.disconnect();
      observer?.disconnect();
      pulseMarker.current?.remove();
      pulseMarker.current = null;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    markers.current.forEach((mk) => mk.remove());

    const padding = () => {
      const i = insetRef.current;
      const w = holder.current?.clientWidth ?? 1200;
      const h = holder.current?.clientHeight ?? 800;
      const left = (i?.left ?? 0) + 48;
      // A stop's name chip hangs off the right of its pin: leave it room when there is room to give.
      const free = w - left - (i?.right ?? 0);
      const right = (i?.right ?? 0) + (free > 620 ? 150 : free > 420 ? 96 : 44);
      const top = (i?.top ?? 0) + 84;
      // Room under the route for the legend (beside a panel) or the sheet's own rounded top (over a sheet).
      const bottom = (i?.bottom ?? 0) + (cinematicRef.current && (i?.left ?? 0) > 0 ? 84 : i?.bottom ? 104 : 64);
      // Never ask for more room than the map has: Mapbox then gives up on framing at all.
      const k = Math.min(1, (w * 0.82) / (left + right), (h * 0.82) / (top + bottom));
      return { top: top * k, right: right * k, bottom: bottom * k, left: left * k };
    };
    const pitch = cinematicRef.current ? TILT : 0;
    const frame = (b: mapboxgl.LngLatBounds, duration = 900) => {
      framed.current = b;
      // The first time a route is framed the camera arrives: it starts high above the city and settles onto the route.
      if (cinematicRef.current && !arrived.current && !previewRef.current) {
        arrived.current = true;
        m.jumpTo({ center: b.getCenter(), zoom: Math.max(3, m.getZoom() - 3.2), pitch: 0, bearing: 0 });
        duration = 2600;
      }
      m.fitBounds(b, { padding: padding(), maxZoom: 15, duration, pitch, bearing: 0 });
    };
    fitRef.current = () => { if (framed.current) m.fitBounds(framed.current, { padding: padding(), maxZoom: 15, duration: 1100, pitch, bearing: 0 }); };

    /** Draws `legList` (progressively revealing it on a genuinely new route), and rides a
     * mode-specific icon marker along it on a loop. Shared by both render branches below. */
    const animateRoute = (legList: MapLeg[]) => {
      pulseMarker.current?.remove();
      pulseMarker.current = null;
      cancelAnimationFrame(raf.current);
      const { legs: pieces, totalKm } = legLines(legList);
      setHasRoute(pieces.length > 0);
      if (pieces.length === 0) {
        (m.getSource("legs") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      const featureFor = (p: (typeof pieces)[number], line: (typeof pieces)[number]["line"]) => ({
        type: "Feature" as const,
        properties: { mode: p.mode, color: MODE_COLOR[p.mode] ?? MODE_COLOR.transit, dim: Boolean(p.dim), traffic: p.traffic ?? "" },
        geometry: { type: "LineString" as const, coordinates: line.geometry.coordinates as Array<[number, number]> },
      });
      const fullFeatures = () => ({ type: "FeatureCollection" as const, features: pieces.map((p) => featureFor(p, p.line)) });

      const key = routeKeyFor(legList);
      if (drawState.current.key !== key) drawState.current = { key, startedAt: performance.now() };

      const el = document.createElement("div");
      el.className = "trip-rider grid h-8 w-8 place-items-center rounded-full border-2 border-white";
      pulseMode.current = "";
      pulseMarker.current = new mapboxgl.Marker({ element: el }).setLngLat(pieces[0].line.geometry.coordinates[0] as [number, number]).addTo(m);

      let dist = 0;
      let last = performance.now();
      let settled = false;
      let flying = false;
      let flightStart = 0;
      let heading = 0;
      const line = lineString(pieces.flatMap((p) => p.line.geometry.coordinates as Array<[number, number]>));
      // A whole route in about a quarter of a minute, however long it is; the camera drops lower on a short one.
      const flightMs = Math.min(40_000, Math.max(14_000, totalKm * 3200));
      const flightZoom = Math.min(16.2, Math.max(13.2, 16.7 - Math.log2(Math.max(totalKm, 1)) * 0.7));
      const tick = (now: number) => {
        const dt = Math.min(now - last, 64);
        last = now;
        if (previewRef.current && !flying) {
          // Lift off from the first stop: the rider restarts there and the camera comes down behind it.
          flying = true;
          dist = 0;
          flightStart = now;
          const first = pieces[0].line.geometry.coordinates;
          heading = bearingBetween(first[0], first[Math.min(8, first.length - 1)]);
          const i = insetRef.current;
          m.easeTo({ center: first[0] as [number, number], zoom: flightZoom, pitch: 62, bearing: heading, duration: 1500, padding: { top: i?.top ?? 0, right: i?.right ?? 0, bottom: i?.bottom ?? 0, left: i?.left ?? 0 }, essential: true });
        }
        if (flying && !previewRef.current) {
          flying = false;
          fitRef.current();
        }
        if (flying) {
          dist += (totalKm / flightMs) * dt;
          if (dist >= totalKm) {
            flying = false;
            previewRef.current = false;
            onPreviewRef.current?.(false);
            dist = 0;
            fitRef.current();
          }
        } else {
          dist = (dist + (totalKm / 8) * (dt / 1000)) % totalKm;
        }
        try {
          const at = along(line, dist, { units: "kilometers" });
          pulseMarker.current?.setLngLat(at.geometry.coordinates as [number, number]);
          if (flying && now - flightStart > 1400) {
            const ahead = along(line, Math.min(totalKm, dist + Math.max(0.3, totalKm * 0.025)), { units: "kilometers" });
            heading = turnToward(heading, bearingBetween(at.geometry.coordinates, ahead.geometry.coordinates), 0.05);
            const i = insetRef.current;
            m.jumpTo({ center: at.geometry.coordinates as [number, number], bearing: heading, pitch: 62, zoom: flightZoom, padding: { top: i?.top ?? 0, right: i?.right ?? 0, bottom: i?.bottom ?? 0, left: i?.left ?? 0 } });
          }

          const current = pieces.find((p) => dist <= p.endKm) ?? pieces[pieces.length - 1];
          if (current.mode !== pulseMode.current) {
            pulseMode.current = current.mode;
            el.style.background = MODE_COLOR[current.mode] ?? MODE_COLOR.unknown;
            el.style.setProperty("--rider", MODE_COLOR[current.mode] ?? MODE_COLOR.unknown);
            const Icon = MODE_ICON[current.mode] ?? MODE_ICON.unknown;
            el.innerHTML = renderToStaticMarkup(<Icon className="h-4 w-4" color="#fff" strokeWidth={2} />);
          }

          // One-time progressive reveal on a genuinely new route, then settle to the full line.
          const elapsed = now - drawState.current.startedAt;
          if (elapsed < DRAW_MS) {
            const revealKm = totalKm * easeOutQuad(Math.min(1, elapsed / DRAW_MS));
            const features = pieces.flatMap((p) => {
              if (revealKm <= p.startKm) return [];
              const visible = revealKm >= p.endKm ? p.line : lineSliceAlong(p.line, 0, revealKm - p.startKm, { units: "kilometers" });
              return [featureFor(p, visible)];
            });
            (m.getSource("legs") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
          } else if (!settled) {
            // Settle once, exactly, to the real (un-sliced) geometry — avoids float drift from slicing. A flag, not a time
            // window: a busy frame that skips past the end of the reveal must not leave the line half drawn.
            settled = true;
            (m.getSource("legs") as mapboxgl.GeoJSONSource | undefined)?.setData(fullFeatures());
          }
        } catch {
          /* style mid-swap */
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    };

    // --- Browse mode: a single A→B route, endpoint markers only ---
    if (browse && browse.legs.length) {
      const path = browse.legs.flatMap((l) => l.polyline).filter((c) => c.length === 2);
      markers.current = [];
      if (path.length) {
        for (const [label, coord, fill] of [["A", path[0], STOP_CORAL], ["B", path[path.length - 1], STOP_INK]] as const) {
          // Mapbox positions the marker root with a transform, so the drop-in plays on a child.
          const el = document.createElement("div");
          const inner = document.createElement("span");
          inner.className = "trip-pin-drop";
          inner.style.cssText = "position:relative;display:block;";
          inner.style.animationDelay = label === "A" ? "120ms" : "260ms";
          inner.innerHTML = pinSvg(fill, label);
          el.appendChild(inner);
          markers.current.push(new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat(coord).addTo(m));
        }
      }
      if (path.length >= 2) {
        const b = new mapboxgl.LngLatBounds(path[0], path[0]);
        path.forEach((c) => b.extend(c));
        frame(b);
      }
      animateRoute(browse.legs);
      return;
    }

    const shown = pins
      .filter((p) => activeDay === "all" || p.day === activeDay)
      .sort((a, b) => (a.day ?? 0) - (b.day ?? 0));

    // Browse mode with no route drawn yet: just sit on the destination.
    if (browse !== undefined && shown.length === 0) {
      markers.current = [];
      (m.getSource("legs") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
      pulseMarker.current?.remove();
      pulseMarker.current = null;
      cancelAnimationFrame(raf.current);
      if (center) m.easeTo({ center, zoom: 11, duration: 600 });
      return;
    }

    // Stops are numbered in visit order, whatever else (a stay, a saved place) is on the map; the Plan and the panel count the same way.
    let stopNumber = 0;
    markers.current = shown.map((p, i) => {
      const el = document.createElement("button");
      // No `position` here: Mapbox positions the marker root absolutely, and a relative override stacks every pin below the last.
      el.style.cssText = "display:block;border:0;background:transparent;padding:0;cursor:pointer;";
      const inner = document.createElement("span");
      inner.className = "trip-pin-drop";
      inner.style.cssText = "position:relative;display:block;";
      inner.style.animationDelay = `${120 + i * 80}ms`;
      inner.innerHTML = p.day != null ? pinSvg(STOP_CORAL, ++stopNumber) : p.kind === "stay" ? pinSvg(STOP_INK, "bed") : pinSvg(KIND_COLOR[p.kind], null);
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
      return new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(m);
    });

    // A pin's name goes on its right; where that would run off the map, it goes on the left instead.
    const placeLabels = () => {
      const width = m.getContainer().clientWidth;
      for (const mk of markers.current) {
        const label = mk.getElement().querySelector<HTMLElement>(".trip-pin-label");
        if (!label) continue;
        const x = m.project(mk.getLngLat()).x;
        label.dataset.side = x + 38 + label.offsetWidth > width - 64 ? "left" : "right";
      }
    };
    placeLabels();
    m.off("moveend", labelsRef.current);
    labelsRef.current = placeLabels;
    m.on("moveend", placeLabels);

    // Route: the real leg polylines when we have them, else a straight line through the stops.
    const straight = shown.map((p) => [p.lng, p.lat] as [number, number]);
    const legList: MapLeg[] = legs && legs.length ? legs : connect && straight.length >= 2 ? [{ polyline: straight, mode: "transit" }] : [];
    const fullPath = legList.flatMap((l) => l.polyline);
    const around = fullPath.length >= 2 ? fullPath : straight;

    if (straight.length === 1) {
      const i = insetRef.current;
      m.easeTo({ center: straight[0], zoom: 13, duration: 700, padding: { top: i?.top ?? 0, right: i?.right ?? 0, bottom: i?.bottom ?? 0, left: i?.left ?? 0 } });
    } else if (around.length >= 2) {
      const b = new mapboxgl.LngLatBounds(around[0], around[0]);
      around.forEach((c) => b.extend(c));
      frame(b);
    }

    animateRoute(legList);
  }, [pins, legs, activeDay, ready, center, browse, connect, styleVersion, insetKey]);

  // Other routes, the time on each, and where one vehicle hands over to the next.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const ghosts = overlay?.ghosts ?? [];
    ghostSelect.current = new Map(ghosts.map((g) => [g.id, g.onSelect]));
    (m.getSource("ghosts") as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: ghosts.filter((g) => g.polyline.length > 1).map((g) => ({ type: "Feature" as const, properties: { id: g.id }, geometry: { type: "LineString" as const, coordinates: g.polyline } })),
    });

    extraMarkers.current.forEach((mk) => mk.remove());
    extraMarkers.current = [];
    const placed: Array<{ line: ReturnType<typeof lineString>; km: number; at: number; marker: mapboxgl.Marker }> = [];
    for (const [i, p] of (overlay?.pills ?? []).entries()) {
      if (p.polyline.length < 2) continue;
      const line = lineString(p.polyline);
      const root = document.createElement("div");
      const pill = document.createElement(p.onClick ? "button" : "span");
      pill.className = cn("trip-pill", p.tone === "ghost" && "trip-pill--ghost");
      pill.style.animationDelay = `${900 + i * 70}ms`;
      pill.textContent = p.text;
      if (p.onClick) {
        pill.setAttribute("type", "button");
        pill.setAttribute("aria-label", `Take the route that takes ${p.text}`);
        pill.onclick = (e) => { e.stopPropagation(); p.onClick?.(); };
      }
      root.appendChild(pill);
      const km = turfLength(line, { units: "kilometers" });
      const marker = new mapboxgl.Marker({ element: root, anchor: "center" }).setLngLat(along(line, km * (p.at ?? 0.5), { units: "kilometers" }).geometry.coordinates as [number, number]).addTo(m);
      extraMarkers.current.push(marker);
      placed.push({ line, km, at: p.at ?? 0.5, marker });
    }
    // Routes that share a road would stack their times on one spot: slide each pill along its own route to the nearest free place.
    const spreadPills = () => {
      const taken: Array<{ x: number; y: number }> = [];
      for (const pl of placed) {
        let best: [number, number] | null = null;
        for (const d of [0, 0.05, -0.05, 0.1, -0.1, 0.15, -0.15, 0.2, -0.2, 0.28, -0.28, 0.36, -0.36]) {
          const f = Math.min(0.92, Math.max(0.08, pl.at + d));
          const lngLat = along(pl.line, pl.km * f, { units: "kilometers" }).geometry.coordinates as [number, number];
          const pt = m.project(lngLat);
          best = lngLat;
          if (taken.every((t) => Math.abs(t.x - pt.x) > 76 || Math.abs(t.y - pt.y) > 32)) break;
        }
        if (best) {
          pl.marker.setLngLat(best);
          const pt = m.project(best);
          taken.push({ x: pt.x, y: pt.y });
        }
      }
    };
    spreadPills();
    m.off("zoomend", pillsRef.current);
    pillsRef.current = spreadPills;
    m.on("zoomend", spreadPills);
    for (const n of overlay?.nodes ?? []) {
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
      extraMarkers.current.push(new mapboxgl.Marker({ element: root, anchor: "center" }).setLngLat(n.at).addTo(m));
    }
    // Names of interchanges only once the map is close enough for them to have room.
    const syncNodeLabels = () => m.getContainer().toggleAttribute("data-near", m.getZoom() >= 12.4);
    syncNodeLabels();
    m.off("zoomend", nodeLabelsRef.current);
    nodeLabelsRef.current = syncNodeLabels;
    m.on("zoomend", syncNodeLabels);
    return () => {
      extraMarkers.current.forEach((mk) => mk.remove());
      extraMarkers.current = [];
    };
  }, [overlay, ready, styleVersion]);

  if (failed) return <div className={cn("grid h-[52vh] min-h-[320px] w-full place-items-center rounded-2xl border border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground", className)}>The map couldn’t load. Try reloading the page.</div>;

  return (
    <div className={cn("trip-map relative h-[52vh] min-h-[320px] w-full overflow-hidden rounded-2xl border border-border", className)}>
      <div ref={holder} className="h-full w-full" />
      {cinematic && hasRoute && (
        <button
          type="button"
          onClick={() => onPreviewChange?.(!preview)}
          aria-pressed={preview}
          aria-label={preview ? "Stop the route preview" : "Preview the route"}
          title={preview ? "Stop the preview" : "Preview the route"}
          className={cn(
            "absolute right-6 top-[176px] z-[2] grid size-11 place-items-center rounded-2xl shadow-lift ring-1 ring-black/[0.04] transition-[transform,background-color,color] duration-150 active:scale-95",
            preview ? "bg-primary text-primary-foreground" : "bg-card/95 text-foreground hover:bg-card",
          )}
        >
          {preview ? <Square className="size-4 fill-current" aria-hidden="true" /> : <Play className="size-[18px] fill-current" aria-hidden="true" />}
        </button>
      )}
      {!ready && <div className="skeleton absolute inset-0 grid place-items-center text-sm text-muted-foreground">Loading map…</div>}
    </div>
  );
}
