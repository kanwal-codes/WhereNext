"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";

type SavedRow = {
  places?: {
    id: string;
    name: string;
    address?: string | null;
    metadata?: { latitude?: number; longitude?: number } | null;
  };
};

type Pin = { id: string; name: string; lng: number; lat: number };

export function MapSurface({ tripId }: { tripId: string }) {
  const { data } = useTripData();

  const pins = useMemo<Pin[]>(() => {
    return ((data?.savedPlaces ?? []) as SavedRow[])
      .map((s) => s.places)
      .filter(Boolean)
      .map((p) => ({ id: p!.id, name: p!.name, lng: Number(p!.metadata?.longitude), lat: Number(p!.metadata?.latitude) }))
      .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && (p.lng !== 0 || p.lat !== 0));
  }, [data?.savedPlaces]);

  const [imgFailed, setImgFailed] = useState(false);
  const mapSrc = pins.length
    ? `/api/trips/${tripId}/map/static?markers=${encodeURIComponent(pins.map((p) => `${p.lng},${p.lat}`).join("|"))}&w=640&h=420`
    : "";

  // Distance check between two saved places
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);

  async function measure() {
    const from = pins.find((p) => p.id === fromId);
    const to = pins.find((p) => p.id === toId);
    if (!from || !to || from.id === to.id) {
      setStatus("Pick two different saved places.");
      return;
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch(`/api/trips/${tripId}/directions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin: [from.lng, from.lat], destination: [to.lng, to.lat], profile: "walking" }),
        signal: request.signal,
      });
      const body = await response.json();
      setStatus(
        response.ok
          ? `${Math.round(body.route.durationSeconds / 60)} min walk · ${(body.route.distanceMeters / 1000).toFixed(1)} km · checked ${new Date(body.freshness.retrievedAt).toLocaleTimeString()}`
          : "Route is unavailable right now.",
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setStatus("Route search cancelled.");
      else setStatus("Route is unavailable right now.");
    } finally {
      setLoading(false);
      if (controller.current === request) controller.current = null;
    }
  }

  const selectClass =
    "mt-1.5 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/25";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {pins.length > 0 && mapSrc && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin Mapbox proxy
            <img
              src={mapSrc}
              alt={`Map with ${pins.length} saved place${pins.length > 1 ? "s" : ""}`}
              width={640}
              height={420}
              onError={() => setImgFailed(true)}
              className="aspect-[16/10] w-full object-cover"
            />
          ) : (
            <div className="grid aspect-[16/10] w-full place-items-center bg-muted/40 px-6 text-center">
              <div>
                <MapPin className="mx-auto h-6 w-6 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {pins.length === 0
                    ? "Save places from Discover and they'll drop onto the map here."
                    : "Map imagery is unavailable right now."}
                </p>
              </div>
            </div>
          )}
        </div>

        {pins.length >= 2 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void measure();
            }}
            className="rounded-2xl border border-border bg-card p-5 shadow-soft"
          >
            <p className="eyebrow">Walking time between two saved places</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                From
                <select aria-label="From place" value={fromId} onChange={(e) => setFromId(e.target.value)} className={selectClass}>
                  <option value="">Select a place</option>
                  {pins.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                To
                <select aria-label="To place" value={toId} onChange={(e) => setToId(e.target.value)} className={selectClass}>
                  <option value="">Select a place</option>
                  {pins.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Measure walking route
            </button>
            {status && <p role="status" className="mt-3 text-xs text-muted-foreground">{status}</p>}
          </form>
        )}
      </div>

      <div className="rounded-2xl border border-dashed border-border p-4">
        <p className="eyebrow">Saved on this trip</p>
        {pins.length > 0 ? (
          <ol className="mt-2 space-y-1.5 text-sm text-ink-soft">
            {pins.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 truncate">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-coral/15 text-[11px] font-semibold text-coral">
                  {i + 1}
                </span>
                {p.name}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Nothing saved yet.</p>
        )}
      </div>
    </div>
  );
}
