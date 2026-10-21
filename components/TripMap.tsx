"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { CATEGORY_HEX } from "@/lib/map-colors";
import along from "@turf/along";
import turfLength from "@turf/length";
import lineSliceAlong from "@turf/line-slice-along";
import { lineString } from "@turf/helpers";
import "mapbox-gl/dist/mapbox-gl.css";
import { MODE_COLOR, STOP_CORAL, STOP_INK } from "@/lib/application/mode-visuals";
import type { MapOverlay } from "@/lib/application/route-overlay";
import { easeOutQuad, legLines, routeKeyFor } from "@/lib/application/route-animation";
import { cn } from "@/lib/utils";
import { FitControl, addLegLayers, basemapPaints } from "@/components/tripMapStyle";
import { framingPadding, labelSide, pinsShown } from "@/components/tripMapLogic";
import { endpointPin, nodeElement, pillElement, riderIconHtml, spreadPillSpots, stopPin } from "@/components/tripMapMarkers";

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
const DRAW_MS = 1200;
/** How far the cinematic camera leans back when the whole route is in view. */
const TILT = 40;

/** Interactive trip map: numbered markers by type, the real route through them, and motion. */
/** The Mapbox token is the same for every map in the session: ask once, and forget a failed answer so the next map can try again. */
let tokenRequest: Promise<string> | null = null;
function mapboxToken(): Promise<string> {
  tokenRequest ??= fetch("/api/config/mapbox")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no token"))))
    .then((body: { token: string }) => body.token)
    .catch((error) => { tokenRequest = null; throw error; });
  return tokenRequest;
}

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
  /** The full-page map: a tilted camera and 3D buildings. */
  cinematic?: boolean;
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
  const arrived = useRef(false);
  const labelsRef = useRef<() => void>(() => {});
  const extraMarkers = useRef<mapboxgl.Marker[]>([]);
  const ghostSelect = useRef<Map<string, () => void>>(new Map());
  const nodeLabelsRef = useRef<() => void>(() => {});
  const pillsRef = useRef<() => void>(() => {});
  const scaleRef = useRef(scaleBar);
  scaleRef.current = scaleBar;
  const cinematicRef = useRef(cinematic);
  cinematicRef.current = cinematic;
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
      for (const [id, prop, value] of basemapPaints(m.getStyle()?.layers ?? [], dark)) {
        try { m.setPaintProperty(id, prop as "fill-color", value as string); } catch { /* this layer is not in this style version */ }
      }
    };

    const addLayers = (m: mapboxgl.Map) => addLegLayers(m, cinematicRef.current);
    const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    const styleFor = (dark: boolean) => (dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11");

    let observer: MutationObserver | null = null;

    mapboxToken()
      .then((token) => {
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

    const padding = () => framingPadding(insetRef.current, holder.current?.clientWidth ?? 1200, holder.current?.clientHeight ?? 800, cinematicRef.current);
    const pitch = cinematicRef.current ? TILT : 0;
    const frame = (b: mapboxgl.LngLatBounds, duration = 900) => {
      framed.current = b;
      // The first time a route is framed the camera arrives: it starts high above the city and settles onto the route.
      if (cinematicRef.current && !arrived.current) {
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
      const line = lineString(pieces.flatMap((p) => p.line.geometry.coordinates as Array<[number, number]>));
      const tick = (now: number) => {
        const dt = Math.min(now - last, 64);
        last = now;
        dist = (dist + (totalKm / 8) * (dt / 1000)) % totalKm;
        try {
          const at = along(line, dist, { units: "kilometers" });
          pulseMarker.current?.setLngLat(at.geometry.coordinates as [number, number]);

          const current = pieces.find((p) => dist <= p.endKm) ?? pieces[pieces.length - 1];
          if (current.mode !== pulseMode.current) {
            pulseMode.current = current.mode;
            el.style.background = MODE_COLOR[current.mode] ?? MODE_COLOR.unknown;
            el.style.setProperty("--rider", MODE_COLOR[current.mode] ?? MODE_COLOR.unknown);
            el.innerHTML = riderIconHtml(current.mode);
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
          markers.current.push(new mapboxgl.Marker({ element: endpointPin(label, fill), anchor: "bottom" }).setLngLat(coord).addTo(m));
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

    const shown = pinsShown(pins, activeDay);

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
    markers.current = shown.map((p, i) => new mapboxgl.Marker({ element: stopPin(p, i, p.day != null ? ++stopNumber : null, KIND_COLOR), anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(m));

    // A pin's name goes on its right; where that would run off the map, it goes on the left instead.
    const placeLabels = () => {
      const width = m.getContainer().clientWidth;
      for (const mk of markers.current) {
        const label = mk.getElement().querySelector<HTMLElement>(".trip-pin-label");
        if (!label) continue;
        const x = m.project(mk.getLngLat()).x;
        label.dataset.side = labelSide(x, label.offsetWidth, width);
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
      const root = pillElement(p, i);
      const km = turfLength(line, { units: "kilometers" });
      const marker = new mapboxgl.Marker({ element: root, anchor: "center" }).setLngLat(along(line, km * (p.at ?? 0.5), { units: "kilometers" }).geometry.coordinates as [number, number]).addTo(m);
      extraMarkers.current.push(marker);
      placed.push({ line, km, at: p.at ?? 0.5, marker });
    }
    // Routes that share a road would stack their times on one spot: slide each pill along its own route to the nearest free place.
    const spreadPills = () => {
      const spots = spreadPillSpots(placed, (lngLat) => m.project(lngLat));
      placed.forEach((pl, i) => pl.marker.setLngLat(spots[i]));
    };
    spreadPills();
    m.off("zoomend", pillsRef.current);
    pillsRef.current = spreadPills;
    m.on("zoomend", spreadPills);
    for (const n of overlay?.nodes ?? []) {
      const root = nodeElement(n);
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
      {!ready && <div className="skeleton absolute inset-0 grid place-items-center text-sm text-muted-foreground">Loading map…</div>}
    </div>
  );
}
