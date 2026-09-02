"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, CalendarDays, Loader2, MapPin } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { askAssistantHref } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

type Row = { places?: { id: string; name: string; metadata?: { latitude?: number; longitude?: number } | null } };
type ItineraryRow = { id: string; title: string; day_index: number; metadata?: { latitude?: number; longitude?: number } | null };
type Pin = { id: string; name: string; lng: number; lat: number; kind: "saved" | "planned"; day?: number };

const MODES = [
  { key: "walking", label: "Walk" },
  { key: "driving", label: "Drive" },
  { key: "cycling", label: "Cycle" },
] as const;
type Mode = (typeof MODES)[number]["key"];

const coords = (m?: { latitude?: number; longitude?: number } | null) => {
  const lng = Number(m?.longitude);
  const lat = Number(m?.latitude);
  return Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0) ? { lng, lat } : null;
};

export function MapSurface({ tripId }: { tripId: string }) {
  const { data } = useTripData();

  const pins = useMemo<Pin[]>(() => {
    const saved: Pin[] = ((data?.savedPlaces ?? []) as Row[])
      .map((s) => s.places)
      .filter(Boolean)
      .flatMap((p) => {
        const c = coords(p!.metadata);
        return c ? [{ id: p!.id, name: p!.name, ...c, kind: "saved" as const }] : [];
      });
    const planned: Pin[] = ((data?.itinerary ?? []) as ItineraryRow[]).flatMap((i) => {
      const c = coords(i.metadata);
      return c ? [{ id: `it-${i.id}`, name: i.title, ...c, kind: "planned" as const, day: i.day_index }] : [];
    });
    // Dedupe planned that sit on top of a saved place.
    const seen = new Set(saved.map((p) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`));
    return [...saved, ...planned.filter((p) => !seen.has(`${p.lng.toFixed(4)},${p.lat.toFixed(4)}`))];
  }, [data?.savedPlaces, data?.itinerary]);

  const [imgFailed, setImgFailed] = useState(false);
  const mapSrc = pins.length
    ? `/api/trips/${tripId}/map/static?markers=${encodeURIComponent(pins.map((p) => `${p.lng},${p.lat}`).join("|"))}&w=640&h=420`
    : "";

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [mode, setMode] = useState<Mode>("walking");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);

  async function measure() {
    const from = pins.find((p) => p.id === fromId);
    const to = pins.find((p) => p.id === toId);
    if (!from || !to || from.id === to.id) {
      setStatus("Pick two different places.");
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
        body: JSON.stringify({ origin: [from.lng, from.lat], destination: [to.lng, to.lat], profile: mode }),
        signal: request.signal,
      });
      const body = await response.json();
      const verb = mode === "driving" ? "drive" : mode === "cycling" ? "ride" : "walk";
      setStatus(
        response.ok
          ? `${Math.round(body.route.durationSeconds / 60)} min ${verb} · ${(body.route.distanceMeters / 1000).toFixed(1)} km`
          : body.error ?? "Route is unavailable right now.",
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setStatus("");
      else setStatus("Route is unavailable right now.");
    } finally {
      setLoading(false);
      if (controller.current === request) controller.current = null;
    }
  }

  const options = pins.map((p) => (
    <option key={p.id} value={p.id}>
      {p.kind === "planned" ? `${p.name} (Day ${(p.day ?? 0) + 1})` : p.name}
    </option>
  ));

  const origin = data?.trip?.origin ?? "";
  const destination = data?.trip?.destination ?? "";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {pins.length > 0 && mapSrc && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin Mapbox proxy
            <img
              src={mapSrc}
              alt={`Map with ${pins.length} place${pins.length > 1 ? "s" : ""}`}
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
                    ? "Save places from Discover or add stops to the itinerary and they'll drop onto the map here."
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
            <p className="eyebrow">Time between two places</p>
            <div className="mt-3 inline-flex rounded-full border border-border p-0.5 text-xs">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={cn("rounded-full px-3 py-1 font-medium transition-colors", mode === m.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                From
                <select aria-label="From place" value={fromId} onChange={(e) => setFromId(e.target.value)} className="input-field">
                  <option value="">Select a place</option>
                  {options}
                </select>
              </label>
              <label className="block text-sm font-medium">
                To
                <select aria-label="To place" value={toId} onChange={(e) => setToId(e.target.value)} className="input-field">
                  <option value="">Select a place</option>
                  {options}
                </select>
              </label>
            </div>
            <button type="submit" disabled={loading} className="btn-primary mt-4">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Measure route
            </button>
            {status && <p role="status" className="mt-3 text-xs text-muted-foreground">{status}</p>}
          </form>
        )}

        <p className="text-xs text-muted-foreground">
          Flying in or out?{" "}
          <Link
            href={askAssistantHref(tripId, { name: `Flights ${origin ? `from ${origin} ` : ""}to ${destination}`, address: null })}
            className="font-medium text-primary hover:underline"
          >
            Ask the assistant to compare fares
          </Link>
          .
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-border p-4">
        <p className="eyebrow">On the map</p>
        {pins.length > 0 ? (
          <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
            {pins.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 truncate">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-coral/15 text-[11px] font-semibold text-coral">
                  {i + 1}
                </span>
                {p.kind === "planned" ? <CalendarDays className="h-3 w-3 shrink-0 text-leaf" /> : <Bookmark className="h-3 w-3 shrink-0 text-muted-foreground" />}
                <span className="truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Nothing pinned yet.</p>
        )}
        {pins.some((p) => p.kind === "planned") && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarDays className="h-3 w-3 text-leaf" /> from the itinerary · <Bookmark className="h-3 w-3" /> saved
          </p>
        )}
      </div>
    </div>
  );
}
