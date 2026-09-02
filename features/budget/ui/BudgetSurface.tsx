"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";

export function BudgetSurface({ tripId, durationDays = 4, travelers = 2 }: { tripId: string; durationDays?: number | null; travelers?: number | null }) {
  const [daily, setDaily] = useState(100);
  const [status, setStatus] = useState("");
  const days = durationDays || 4;
  const people = travelers || 2;

  useEffect(() => {
    fetch(`/api/trips/${tripId}/memory`)
      .then((r) => r.json())
      .then((body) => {
        if (typeof body.memory?.budget === "number") setDaily(body.memory.budget);
      })
      .catch(() => setStatus("Budget assumption could not load."));
  }, [tripId]);

  async function update(value: number) {
    setDaily(value);
    const r = await fetch(`/api/trips/${tripId}/memory`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ budget: value }) });
    if (r.ok) {
      setStatus("Saved.");
      announceWorkspaceChange("preferences");
    } else setStatus("Budget assumption could not save.");
  }

  const tiles = [
    { label: "Daily", value: `$${daily}` },
    { label: `${days}-day total`, value: `$${daily * days}` },
    { label: `Per person (${people})`, value: `$${(daily * days / people).toFixed(0)}` },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <p className="text-sm leading-relaxed text-ink-soft">
          A transparent estimate for this trip &mdash; an assumption you set, not a live quote.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Daily budget (per person)
          <div className="mt-2 flex items-center gap-3">
            <input
              type="range"
              min={20}
              max={600}
              step={10}
              value={daily}
              onChange={(e) => update(Number(e.target.value))}
              className="flex-1 accent-[var(--coral)]"
            />
            <input
              type="number"
              min={0}
              value={daily}
              onChange={(e) => update(Number(e.target.value))}
              className="w-24 rounded-xl border border-input bg-background px-3 py-1.5 text-sm tabular-nums"
            />
          </div>
        </label>
        {status && (
          <p role="status" className="mt-3 inline-flex items-center gap-1 text-xs text-leaf">
            <Check className="h-3 w-3" /> {status}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-[11px] tracking-[0.1em] text-muted-foreground uppercase">{t.label}</p>
            <p className="mt-1.5 font-display text-lg tabular-nums">{t.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
