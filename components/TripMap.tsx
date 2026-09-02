"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import along from "@turf/along";
import length from "@turf/length";
import { lineString, points as turfPoints } from "@turf/helpers";
import "mapbox-gl/dist/mapbox-gl.css";
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
const MODE_COLOR: Record<string, string> = {
  walk: "#9aa0a6", bus: "#2563eb", subway: "#e2603f", tram: "#0891b2", train: "#16a34a", ferry: "#0d9488", drive: "#6b7280", transit: "#2563eb", flight: "#7c3aed", unknown: "#9aa0a6",
};

/** Interactive trip map: numbered markers by type, the real route through them, and motion. */
export function TripMap({
  pins,
  legs,
  activeDay,
  center,
  browse,
  className,
}: {
  pins: MapPin[];
  legs?: MapLeg[];
  activeDay: number | "all";
  /** Fallback view when there are no pins. */
  center?: [number, number];
  /** Ad-hoc A→B route (Browse mode) — drawn instead of the itinerary, with A/B markers. */
  browse?: { legs: MapLeg[]; from?: string; to?: string } | null;
  className?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const raf = useRef<number>(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config/mapbox")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no token"))))
      .then(({ token }) => {
        if (cancelled || !holder.current || map.current) return;
        mapboxgl.accessToken = token;
        const dark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
        const start: [number, number] = pins[0] ? [pins[0].lng, pins[0].lat] : center ?? [0, 20];
        const m = new mapboxgl.Map({
          container: holder.current,
          style: dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11",
          center: start,
          zoom: pins.length || center ? 11 : 1.4,
          attributionControl: false,
        });
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        m.on("error", () => {
          if (!map.current) setFailed(true); // only fatal (never-loaded) errors kill the map
        });
        m.on("load", () => {
          m.addSource("legs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
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
          m.addSource("pulse", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addLayer({ id: "pulse", type: "circle", source: "pulse", paint: { "circle-radius": 6, "circle-color": "#e2603f", "circle-opacity": 0.9, "circle-stroke-width": 3, "circle-stroke-color": "#fff" } });
          if (!cancelled) {
            map.current = m;
            setReady(true);
            requestAnimationFrame(() => m.resize());
          }
        });
      })
      .catch(() => setFailed(true));

    const ro = holder.current ? new ResizeObserver(() => map.current?.resize()) : null;
    if (ro && holder.current) ro.observe(holder.current);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
      ro?.disconnect();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    markers.current.forEach((mk) => mk.remove());

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
      (m.getSource("legs") as mapboxgl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: browse.legs
          .filter((l) => l.polyline.length >= 2)
          .map((l) => ({
            type: "Feature" as const,
            properties: { mode: l.mode, color: l.color ?? MODE_COLOR[l.mode] ?? MODE_COLOR.transit, dim: false },
            geometry: { type: "LineString" as const, coordinates: l.polyline },
          })),
      });
      const fp = path;
      (m.getSource("pulse") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
      if (fp.length >= 2) {
        const b = new mapboxgl.LngLatBounds(fp[0], fp[0]);
        fp.forEach((c) => b.extend(c));
        m.fitBounds(b, { padding: 64, maxZoom: 15, duration: 800 });
      }
      cancelAnimationFrame(raf.current);
      if (fp.length >= 2) {
        const line = lineString(fp);
        const totalKm = length(line, { units: "kilometers" }) || 0.001;
        let dist = 0;
        let last = performance.now();
        const tick = (now: number) => {
          const dt = Math.min(now - last, 64);
          last = now;
          dist = (dist + (totalKm / 8) * (dt / 1000)) % totalKm;
          try {
            const at = along(line, dist, { units: "kilometers" });
            (m.getSource("pulse") as mapboxgl.GeoJSONSource | undefined)?.setData(turfPoints([at.geometry.coordinates as [number, number]]));
            m.setPaintProperty("pulse", "circle-radius", 5 + 3 * (1 + Math.sin(now / 260)));
          } catch {
            /* style swap */
          }
          raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
      }
      return;
    }

    const shown = pins
      .filter((p) => activeDay === "all" || p.day === activeDay)
      .sort((a, b) => (a.day ?? 0) - (b.day ?? 0));

    // Browse mode with no route drawn yet: just sit on the destination.
    if (browse !== undefined && shown.length === 0) {
      markers.current = [];
      (m.getSource("legs") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
      (m.getSource("pulse") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
      cancelAnimationFrame(raf.current);
      if (center) m.easeTo({ center, zoom: 11, duration: 600 });
      return;
    }

    markers.current = shown.map((p, i) => {
      const el = document.createElement("button");
      el.className = "grid h-6 min-w-[1.5rem] place-items-center rounded-full border-2 border-white px-1 text-[11px] font-bold text-white shadow";
      el.style.background = KIND_COLOR[p.kind];
      el.textContent = String(i + 1);
      el.title = `${p.name}${p.day != null ? ` · Day ${p.day}` : ""}`;
      if (p.href) el.onclick = () => { window.location.href = p.href!; };
      return new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m);
    });

    // Route: the real leg polylines when we have them, else a straight line through the stops.
    const straight = shown.map((p) => [p.lng, p.lat] as [number, number]);
    const features = (legs && legs.length
      ? legs.filter((l) => l.polyline.length >= 2).map((l) => ({
          type: "Feature" as const,
          properties: { mode: l.mode, color: MODE_COLOR[l.mode] ?? MODE_COLOR.transit, dim: Boolean(l.dim) },
          geometry: { type: "LineString" as const, coordinates: l.polyline },
        }))
      : straight.length >= 2
        ? [{ type: "Feature" as const, properties: { mode: "transit", color: MODE_COLOR.transit, dim: false }, geometry: { type: "LineString" as const, coordinates: straight } }]
        : []);
    (m.getSource("legs") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });

    const fullPath = legs && legs.length ? legs.flatMap((l) => l.polyline) : straight;
    (m.getSource("pulse") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });

    if (straight.length === 1) {
      m.easeTo({ center: straight[0], zoom: 13, duration: 700 });
    } else if (fullPath.length >= 2) {
      const b = new mapboxgl.LngLatBounds(fullPath[0], fullPath[0]);
      fullPath.forEach((c) => b.extend(c));
      m.fitBounds(b, { padding: 64, maxZoom: 15, duration: 800 });
    }

    cancelAnimationFrame(raf.current);
    if (fullPath.length < 2) return;
    const line = lineString(fullPath);
    const totalKm = length(line, { units: "kilometers" }) || 0.001;
    let dist = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      dist = (dist + (totalKm / 8) * (dt / 1000)) % totalKm;
      try {
        const at = along(line, dist, { units: "kilometers" });
        (m.getSource("pulse") as mapboxgl.GeoJSONSource | undefined)?.setData(turfPoints([at.geometry.coordinates as [number, number]]));
        m.setPaintProperty("pulse", "circle-radius", 5 + 3 * (1 + Math.sin(now / 260)));
      } catch {
        /* style mid-swap */
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [pins, legs, activeDay, ready, center, browse]);

  if (failed) return null;

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border", className)}>
      <div ref={holder} className="h-[52vh] min-h-[320px] w-full" />
      {!ready && <div className="absolute inset-0 grid place-items-center bg-muted/40 text-sm text-muted-foreground">Loading map…</div>}
    </div>
  );
}
