"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { cn } from "@/lib/utils";

const ITEMS = [
  "Check weather and packing needs",
  "Confirm tickets and opening hours",
  "Check connectivity and power",
  "Sort local transit — passes or apps",
  "Record dietary or accessibility needs",
  "Note key numbers — hotel, embassy, insurance",
];

export function EssentialsSurface({ tripId, initialCompleted }: { tripId: string; initialCompleted?: string[] }) {
  const [done, setDone] = useState<string[]>(initialCompleted ?? []);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialCompleted) return;
    fetch(`/api/trips/${tripId}/essentials`)
      .then((r) => r.json())
      .then((body) => setDone(body.completed ?? []))
      .catch(() => setError("We couldn't load your checklist. Try again in a moment."));
  }, [tripId, initialCompleted]);

  async function toggle(item: string) {
    const next = done.includes(item) ? done.filter((v) => v !== item) : [...done, item];
    setDone(next);
    const r = await fetch(`/api/trips/${tripId}/essentials`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed: next }),
    });
    if (!r.ok) {
      setDone(done);
      setError("That didn't save. Try again.");
    } else announceWorkspaceChange("essentials");
  }

  const complete = ITEMS.filter((i) => done.includes(i)).length;
  const pct = Math.round((complete / ITEMS.length) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-leaf transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
          {complete}/{ITEMS.length}
        </span>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {ITEMS.map((item) => {
          const checked = done.includes(item);
          return (
            <li key={item}>
              <button
                type="button"
                onClick={() => void toggle(item)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors hover:bg-accent active:bg-accent"
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                    checked ? "border-leaf bg-leaf text-background" : "border-border",
                  )}
                >
                  {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className={cn("transition-colors", checked && "text-muted-foreground line-through")}>{item}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
