"use client";

import { useEffect, useState } from "react";
import { CloudSun, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Outlook = { kind: "forecast" | "seasonal" | "none"; summary?: string | null; month?: string };

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
    fetch(`/api/trips/${tripId}/weather?location=${encodeURIComponent(location)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled) {
          try { sessionStorage.setItem(key, JSON.stringify(body)); } catch { /* ignore */ }
          setData(body ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
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
    <span className={cn("inline-flex items-start gap-1.5 text-sm text-muted-foreground", className)}>
      <CloudSun className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {data.summary}
    </span>
  );
}
