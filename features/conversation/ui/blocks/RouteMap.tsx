"use client";

import React, { useEffect, useState, type ReactNode } from "react";

export type RouteMapLine = { points: Array<[number, number]>; color: string; width: number; opacity?: number };
export type RouteMapRequest = { lines: RouteMapLine[]; pins: Array<{ at: [number, number]; color: string }>; size: { width: number; height: number } };

/** Maps already drawn this session, so flipping between routes and back is instant. */
const drawn = new Map<string, string>();

/**
 * A real street map with the route lines drawn on it (Mapbox, through our own route so the token stays on the server).
 * `fallback` (the plain sketch) shows until the map arrives, and stays if it never does (no token, offline, rate limit).
 */
export function RouteMap({ request, fallback, label }: { request: RouteMapRequest; fallback: ReactNode; label: string }) {
  const key = JSON.stringify(request);
  const [src, setSrc] = useState<string | null>(drawn.get(key) ?? null);
  useEffect(() => {
    const cached = drawn.get(key);
    if (cached) { setSrc(cached); return; }
    const controller = new AbortController();
    fetch("/api/route-map", { method: "POST", headers: { "content-type": "application/json" }, body: key, signal: controller.signal })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error("map unavailable"))))
      .then((blob) => { const url = URL.createObjectURL(blob); drawn.set(key, url); setSrc(url); })
      .catch(() => {});
    return () => controller.abort();
  }, [key]);
  return (
    <div className="relative size-full overflow-hidden">
      {fallback}
      {/* A blob: URL from our own route, so next/image has nothing to optimise. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt={label} className="absolute inset-0 size-full animate-in fade-in object-cover duration-300" />}
    </div>
  );
}
