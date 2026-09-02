"use client";

import { useEffect, useState } from "react";
import { CloudSun, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Current conditions + near-term outlook for a place. Compact by default (one
 * line for a page header); `card` renders it as a standalone panel.
 */
export function TripWeather({ tripId, location, className, card = false }: { tripId: string; location: string; className?: string; card?: boolean }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!location) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/trips/${tripId}/weather?location=${encodeURIComponent(location)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled) {
          setSummary(body?.summary ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
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
  if (!summary) return null;

  if (card) {
    return (
      <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-soft", className)}>
        <p className="eyebrow inline-flex items-center gap-1.5">
          <CloudSun className="h-3.5 w-3.5 text-coral" /> Weather now
        </p>
        <p className="mt-1.5 text-sm text-ink-soft">{summary}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Ask the assistant what it&rsquo;s usually like on your dates and what to pack.</p>
      </div>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
      <CloudSun className="h-3.5 w-3.5" /> {summary}
    </span>
  );
}
