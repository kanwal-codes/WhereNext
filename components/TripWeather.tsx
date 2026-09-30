"use client";

import { useEffect, useState } from "react";
import { CloudSun, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Outlook = { kind: "forecast" | "seasonal" | "none"; summary?: string | null; month?: string };

// Same request can be kicked off twice in quick succession for one key (two TripWeather
// instances on one page, or a render that runs the effect more than once) — a plain
// sessionStorage check-then-write race doesn't catch that, since both checks land before
// either write. De-dupe in-flight requests by key, same pattern as the server's ttl-cache.
const inflight = new Map<string, Promise<Outlook | null>>();

function fetchWeather(tripId: string, location: string): Promise<Outlook | null> {
  const key = `weather:${tripId}:${location}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = fetch(`/api/trips/${tripId}/weather?location=${encodeURIComponent(location)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((body: Outlook | null) => {
      try { sessionStorage.setItem(key, JSON.stringify(body)); } catch { /* ignore */ }
      return body;
    })
    .catch(() => null)
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/**
 * Weather sized to the trip, not to today. A forecast only when the trip is
 * within a few days; otherwise the typical weather for the trip's month; nothing
 * when there are no dates to hang it on.
 */
export function TripWeather({ tripId, location, className, card = false }: { tripId: string; location: string; className?: string; card?: boolean }) {
  const [data, setData] = useState<Outlook | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!location) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const key = `weather:${tripId}:${location}`;
    try { const cached = sessionStorage.getItem(key); if (cached) { setData(JSON.parse(cached)); setLoading(false); return () => { cancelled = true; }; } } catch { /* ignore */ }
    setLoading(true);
    fetchWeather(tripId, location).then((body) => {
      if (!cancelled) {
        setData(body);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tripId, location]);

  if (loading) {
    return card ? (
      <div className={cn("flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" /> Checking the weather…
      </div>
    ) : null;
  }
  if (!data || data.kind === "none" || !data.summary) return null;

  const label = data.kind === "seasonal" ? `Typical weather${data.month ? ` · ${data.month}` : ""}` : "During your trip";

  if (card) {
    return (
      <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-soft", className)}>
        <p className="eyebrow inline-flex items-center gap-1.5">
          <CloudSun className="h-3.5 w-3.5 text-coral" /> {label}
        </p>
        <p className="mt-1.5 text-sm text-ink-soft">{data.summary}</p>
      </div>
    );
  }

  return (
    <span className={cn("inline-flex items-start gap-2 text-sm leading-snug text-muted-foreground", className)}>
      <CloudSun className="mt-px size-4 shrink-0" aria-hidden /> <span className="line-clamp-2">{data.summary.split(/(?<=[.!?])\s+/)[0]}</span>
    </span>
  );
}
