"use client";

import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import mapboxgl from "mapbox-gl";
import along from "@turf/along";
import lineSliceAlong from "@turf/line-slice-along";
import { lineString } from "@turf/helpers";
import "mapbox-gl/dist/mapbox-gl.css";
import { MODE_COLOR, MODE_ICON } from "@/lib/application/mode-visuals";
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
export type MapLeg = { polyline: Array<[number, number]>; mode: string; dim?: boolean; color?: string };

const KIND_COLOR: Record<MapPin["kind"], string> = {
  stay: "#e2603f", eat: "#d9932b", see: "#3b82c4", do: "#3f9d6b", event: "#8b5cf6", saved: "#8a8a8a",
};
const DRAW_MS = 1200;

/** A classic map-pin teardrop (not a plain badge) so stops read as places on a map, not a numbered
 * list — the visit-order number still sits in the white "head", same as before. Sized so the
 * bottom tip is the exact coordinate; pair with `anchor: "bottom"` on the Marker. */
function pinSvg(color: string, order: number): string {
  return `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="14" cy="14" r="9" fill="white"/>
    <text x="14" y="18.5" text-anchor="middle" font-size="11" font-weight="700" fill="${color}">${order}</text>
  </svg>`;
}

/** Interactive trip map: numbered markers by type, the real route through them, and motion. */
export function TripMap({
  pins,
  legs,
  activeDay,
  center,
  browse,
  connect = true,
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
  className?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const pulseMarker = useRef<mapboxgl.Marker | null>(null);
  const pulseMode = useRef<string>("");
  const raf = useRef<number>(0);
  const drawState = useRef<{ key: string; startedAt: number }>({ key: "", startedAt: 0 });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumped after a live theme swap (`setStyle` wipes the map's custom sources) so the data-paint
  // effect below re-runs and redraws pins/legs even though none of its own props changed.
  const [styleVersion, setStyleVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // Custom sources/layers don't reliably survive `setStyle()` across a full basemap swap
    // (dark-v11 <-> light-v11), so this re-adds them idempotently — called on the initial
    // style load AND every subsequent one (a live theme-toggle triggers another `style.load`).
    const addLayers = (m: mapboxgl.Map) => {
      if (m.getSource("legs")) return;
      m.addSource("legs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      // A soft glow underneath the crisp line — same source, one extra layer, inserted below it.
      m.addLayer({
        id: "legs-glow",
        type: "line",
        source: "legs",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#2563eb"],
          "line-width": ["case", ["get", "dim"], 4, 10],
          "line-opacity": ["case", ["get", "dim"], 0.12, 0.25],
          "line-blur": 6,
        },
      });
      m.addLayer({
        id: "legs",
        type: "line",
        source: "legs",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#2563eb"],
          "line-width": ["case", ["get", "dim"], 2, 4],
          "line-opacity": ["case", ["get", "dim"], 0.35, 0.95],
          "line-dasharray": ["case", ["any", ["==", ["get", "mode"], "walk"], ["==", ["get", "mode"], "flight"]], ["literal", [1, 2]], ["literal", [1, 0]]],
        },
      });
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
        });
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        m.on("error", () => {
          if (!map.current) setFailed(true); // only fatal (never-loaded) errors kill the map
        });
        m.on("style.load", () => {
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
      .catch(() => setFailed(true));

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

      const fullFeatures = () => ({
        type: "FeatureCollection" as const,
        features: pieces.map((p) => ({
          type: "Feature" as const,
          properties: { mode: p.mode, color: p.color ?? MODE_COLOR[p.mode] ?? MODE_COLOR.transit, dim: Boolean(p.dim) },
          geometry: { type: "LineString" as const, coordinates: p.line.geometry.coordinates as Array<[number, number]> },
        })),
      });

      const key = routeKeyFor(legList);
      if (drawState.current.key !== key) drawState.current = { key, startedAt: performance.now() };

      const el = document.createElement("div");
      el.className = "grid h-7 w-7 place-items-center rounded-full border-2 border-white shadow";
      pulseMode.current = "";
      pulseMarker.current = new mapboxgl.Marker({ element: el }).setLngLat(pieces[0].line.geometry.coordinates[0] as [number, number]).addTo(m);

      let dist = 0;
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(now - last, 64);
        last = now;
        dist = (dist + (totalKm / 8) * (dt / 1000)) % totalKm;
        try {
          const line = lineString(pieces.flatMap((p) => p.line.geometry.coordinates as Array<[number, number]>));
          const at = along(line, dist, { units: "kilometers" });
          pulseMarker.current?.setLngLat(at.geometry.coordinates as [number, number]);

          const current = pieces.find((p) => dist <= p.endKm) ?? pieces[pieces.length - 1];
          if (current.mode !== pulseMode.current) {
            pulseMode.current = current.mode;
            el.style.background = MODE_COLOR[current.mode] ?? MODE_COLOR.unknown;
            const Icon = MODE_ICON[current.mode] ?? MODE_ICON.unknown;
            el.innerHTML = renderToStaticMarkup(<Icon className="h-3.5 w-3.5" color="#fff" />);
          }

          // One-time progressive reveal on a genuinely new route, then settle to the full line.
          const elapsed = now - drawState.current.startedAt;
          if (elapsed < DRAW_MS) {
            const revealKm = totalKm * easeOutQuad(Math.min(1, elapsed / DRAW_MS));
            const features = pieces.flatMap((p) => {
              if (revealKm <= p.startKm) return [];
              const visible = revealKm >= p.endKm ? p.line : lineSliceAlong(p.line, 0, revealKm - p.startKm, { units: "kilometers" });
              return [{
                type: "Feature" as const,
                properties: { mode: p.mode, color: p.color ?? MODE_COLOR[p.mode] ?? MODE_COLOR.transit, dim: Boolean(p.dim) },
                geometry: { type: "LineString" as const, coordinates: visible.geometry.coordinates as Array<[number, number]> },
              }];
            });
            (m.getSource("legs") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
          } else if (elapsed < DRAW_MS + 50) {
            // Settle once, exactly, to the real (un-sliced) geometry — avoids float drift from slicing.
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
        for (const [label, coord] of [["A", path[0]], ["B", path[path.length - 1]]] as const) {
          const el = document.createElement("div");
          el.className = "grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-primary text-[11px] font-bold text-white shadow";
          el.textContent = label;
          markers.current.push(new mapboxgl.Marker({ element: el }).setLngLat(coord).addTo(m));
        }
      }
      if (path.length >= 2) {
        const b = new mapboxgl.LngLatBounds(path[0], path[0]);
        path.forEach((c) => b.extend(c));
        m.fitBounds(b, { padding: 64, maxZoom: 15, duration: 800 });
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

    markers.current = shown.map((p, i) => {
      const el = document.createElement("button");
      el.style.cssText = "position:relative;display:block;border:0;background:transparent;padding:0;cursor:pointer;";
      el.innerHTML = pinSvg(KIND_COLOR[p.kind], i + 1);
      const label = document.createElement("span");
      label.textContent = p.name;
      // Absolutely positioned so it doesn't enlarge the marker's own box — Mapbox anchors
      // ("bottom" below) against that box, and it must stay just the pin's own footprint for
      // the tip to land exactly on the coordinate.
      label.style.cssText = "position:absolute;left:32px;top:8px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:rgba(17,17,20,0.85);color:#fff;font-size:11px;font-weight:600;line-height:1.3;padding:2px 8px;border-radius:9999px;box-shadow:0 1px 3px rgb(0 0 0 / 0.35);";
      el.appendChild(label);
      el.title = `${p.name}${p.day != null ? ` · Day ${p.day}` : ""}`;
      if (p.href) el.onclick = () => { window.location.href = p.href!; };
      return new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(m);
    });

    // Route: the real leg polylines when we have them, else a straight line through the stops.
    const straight = shown.map((p) => [p.lng, p.lat] as [number, number]);
    const legList: MapLeg[] = legs && legs.length ? legs : connect && straight.length >= 2 ? [{ polyline: straight, mode: "transit" }] : [];
    const fullPath = legList.flatMap((l) => l.polyline);
    const framed = fullPath.length >= 2 ? fullPath : straight;

    if (straight.length === 1) {
      m.easeTo({ center: straight[0], zoom: 13, duration: 700 });
    } else if (framed.length >= 2) {
      const b = new mapboxgl.LngLatBounds(framed[0], framed[0]);
      framed.forEach((c) => b.extend(c));
      m.fitBounds(b, { padding: 64, maxZoom: 15, duration: 800 });
    }

    animateRoute(legList);
  }, [pins, legs, activeDay, ready, center, browse, connect, styleVersion]);

  if (failed) return null;

  return (
    <div className={cn("relative h-[52vh] min-h-[320px] w-full overflow-hidden rounded-2xl border border-border", className)}>
      <div ref={holder} className="h-full w-full" />
      {!ready && <div className="absolute inset-0 grid place-items-center bg-muted/40 text-sm text-muted-foreground">Loading map…</div>}
    </div>
  );
}
