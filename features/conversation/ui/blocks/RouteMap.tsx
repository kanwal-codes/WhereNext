"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { useNearView } from "@/lib/use-near-view";

export type RouteMapLine = { points: Array<[number, number]>; color: string; width: number; opacity?: number };
export type RouteMapRequest = { lines: RouteMapLine[]; pins: Array<{ at: [number, number]; color: string }>; size: { width: number; height: number } };

/** The route lines the map route accepts: at most this many points each (a long journey drawn leg by leg can run past it). */
const MAX_POINTS = 400;
const thin = (points: Array<[number, number]>) => {
  if (points.length <= MAX_POINTS) return points;
  const step = (points.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => points[Math.round(i * step)]);
};

/** Maps already drawn this session, so flipping between routes and back is instant. */
const drawn = new Map<string, string>();

/**
 * A real street map with the route lines drawn on it (Mapbox, through our own route so the token stays on the server).
 * `fallback` (the plain sketch) shows until the map arrives, and stays if it never does (no token, offline, rate limit).
 */
export function RouteMap({ request, fallback, label }: { request: RouteMapRequest; fallback: ReactNode; label: string }) {
  // Thinned first: an over-long line used to make the whole request a 400, and the card kept its plain sketch instead of a map.
  const key = JSON.stringify({ ...request, lines: request.lines.map((line) => ({ ...line, points: thin(line.points) })) });
  const [src, setSrc] = useState<string | null>(drawn.get(key) ?? null);
  // Every route card in a long chat history used to draw its map the moment the chat opened (a server-side
  // Mapbox render, 100–280 KB, uncacheable as a POST). Now only cards someone scrolls near do.
  const [boxRef, near] = useNearView<HTMLDivElement>(600);
  useEffect(() => {
    const cached = drawn.get(key);
    if (cached) { setSrc(cached); return; }
    if (!near) return;
    const controller = new AbortController();
    fetch("/api/route-map", { method: "POST", headers: { "content-type": "application/json" }, body: key, signal: controller.signal })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error("map unavailable"))))
      .then((blob) => { const url = URL.createObjectURL(blob); drawn.set(key, url); setSrc(url); })
      .catch(() => {});
    return () => controller.abort();
  }, [key, near]);
  return (
    <div ref={boxRef} className="relative size-full overflow-hidden">
      {fallback}
      {/* A blob: URL from our own route, so next/image has nothing to optimise. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt={label} className="absolute inset-0 size-full animate-in fade-in object-cover duration-300" />}
    </div>
  );
}
