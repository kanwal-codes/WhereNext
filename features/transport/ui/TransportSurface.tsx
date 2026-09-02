"use client";

import { useRef, useState } from "react";
import { Footprints, Loader2, TrainFront } from "lucide-react";

type Step = {
  mode?: string;
  durationSeconds?: number;
  line?: string;
  headsign?: string;
  departureStop?: string;
  arrivalStop?: string;
};
type Route = {
  durationSeconds: number;
  distanceMeters: number;
  steps?: Step[];
  departureTime?: string;
  arrivalTime?: string;
};

const mins = (s = 0) => Math.max(1, Math.round(s / 60));

function StepLine({ step }: { step: Step }) {
  const walking = (step.mode ?? "").toUpperCase().includes("WALK");
  if (walking) {
    return (
      <li className="flex items-center gap-2 text-ink-soft">
        <Footprints className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        Walk {mins(step.durationSeconds)} min
        {step.arrivalStop ? ` to ${step.arrivalStop}` : ""}
      </li>
    );
  }
  return (
    <li className="flex items-start gap-2 text-ink-soft">
      <TrainFront className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coral" />
      <span>
        {step.line && <span className="font-medium text-foreground">{step.line}</span>}
        {step.headsign ? ` toward ${step.headsign}` : ""}
        {step.departureStop || step.arrivalStop ? (
          <span className="block text-xs text-muted-foreground">
            {step.departureStop ?? "—"} → {step.arrivalStop ?? "—"} · {mins(step.durationSeconds)} min
          </span>
        ) : (
          <span className="text-xs text-muted-foreground"> · {mins(step.durationSeconds)} min</span>
        )}
      </span>
    </li>
  );
}

export function TransportSurface({ tripId, origin = "", destination = "" }: { tripId: string; origin?: string | null; destination?: string }) {
  const [from, setFrom] = useState(origin ?? "");
  const [to, setTo] = useState(destination);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [status, setStatus] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);

  async function search() {
    if (!from.trim() || !to.trim()) {
      setStatus("Enter both an origin and a destination.");
      return;
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch(`/api/trips/${tripId}/transit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin: from, destination: to }),
        signal: request.signal,
      });
      const body = await response.json();
      const found = (body.routes ?? []) as Route[];
      setRoutes(found);
      setSearched(true);
      setStatus(
        !response.ok
          ? "Transit is unavailable right now."
          : found.length === 0
            ? ""
            : `${found.length} route${found.length === 1 ? "" : "s"}${body.freshness ? ` · checked ${new Date(body.freshness.retrievedAt).toLocaleTimeString()}` : ""}`,
      );
    } catch (error) {
      setRoutes([]);
      if (error instanceof DOMException && error.name === "AbortError") setStatus("Search cancelled.");
      else setStatus("Transit is unavailable right now.");
    } finally {
      setLoading(false);
      if (controller.current === request) controller.current = null;
    }
  }

  const field = "input-field";

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="rounded-2xl border border-border bg-card p-5 shadow-soft"
      >
        <p className="eyebrow">Live public transit</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            From
            <input value={from} onChange={(e) => setFrom(e.target.value)} className={field} placeholder="Station, address or place" />
          </label>
          <label className="block text-sm font-medium">
            To
            <input value={to} onChange={(e) => setTo(e.target.value)} className={field} placeholder="Station, address or place" />
          </label>
        </div>
        <button type="submit" disabled={loading} className="btn-primary mt-4">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrainFront className="h-4 w-4" />}
          Search live transit
        </button>
        {status && <p role="status" className="mt-3 text-xs text-muted-foreground">{status}</p>}
      </form>

      {searched && !loading && routes.length === 0 && !status && (
        <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          No public-transit route came back for that pair. Try nearby stations, or ask the assistant for
          driving and walking options.
        </div>
      )}

      {routes.map((route, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-lg tabular-nums">{mins(route.durationSeconds)} min</span>
            <span className="text-xs text-muted-foreground tabular-nums">{(route.distanceMeters / 1000).toFixed(1)} km</span>
            {route.departureTime && route.arrivalTime && (
              <span className="text-xs text-muted-foreground">
                {new Date(route.departureTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} →{" "}
                {new Date(route.arrivalTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
          {route.steps && route.steps.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {route.steps.map((step, si) => (
                <StepLine key={si} step={step} />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
