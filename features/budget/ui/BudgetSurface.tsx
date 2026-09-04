"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";

export function BudgetSurface({
  tripId,
  durationDays,
  travelers,
  initialBudget,
}: {
  tripId: string;
  durationDays?: number | null;
  travelers?: number | null;
  /** Seeded from the layout's workspace snapshot; the surface only fetches when it's absent. */
  initialBudget?: unknown;
}) {
  const seeded = typeof initialBudget === "number";
  const [daily, setDaily] = useState(seeded ? (initialBudget as number) : 100);
  const [saved, setSaved] = useState(false);
  const days = durationDays || null;
  const people = travelers || null;

  useEffect(() => {
    if (seeded) return;
    fetch(`/api/trips/${tripId}/memory`)
      .then((r) => r.json())
      .then((body) => {
        if (typeof body.memory?.budget === "number") setDaily(body.memory.budget);
      })
      .catch(() => undefined);
  }, [tripId, seeded]);

  async function update(value: number) {
    setDaily(value);
    setSaved(false);
    const r = await fetch(`/api/trips/${tripId}/memory`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ budget: value }) });
    if (r.ok) {
      setSaved(true);
      announceWorkspaceChange("preferences");
    } else notifyToast("That didn't save. Try again.", "error");
  }

  const rows: Array<[string, string]> = [
    ["Per person, per day", `$${daily}`],
    ["Per person, whole trip", days ? `$${daily * days}` : "Set the trip length"],
    ["Whole group", days && people ? `$${daily * days * people}` : people ? "Set the trip length" : "Set travellers"],
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg">Budget</h2>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs text-leaf">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">An assumption you set — Roam uses it to weigh options.</p>

      <div className="mt-4 flex items-center gap-3">
        <input
          type="range"
          min={20}
          max={600}
          step={10}
          value={daily}
          onChange={(e) => update(Number(e.target.value))}
          aria-label="Daily budget per person"
          className="flex-1 accent-[var(--coral)]"
        />
        <input
          type="number"
          aria-label="Daily budget per person"
          name="daily-budget"
          min={0}
          value={daily}
          onChange={(e) => update(Number(e.target.value))}
          className="w-20 rounded-xl border border-input bg-background px-2.5 py-1.5 text-sm tabular-nums"
        />
      </div>

      <dl className="mt-4 divide-y divide-border text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
