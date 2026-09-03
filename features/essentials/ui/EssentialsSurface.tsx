"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { cn } from "@/lib/utils";

const ITEMS = [
  "Check weather and packing needs",
  "Confirm tickets and opening hours",
  "Check connectivity and power",
  "Record dietary or accessibility needs",
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

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {ITEMS.map((item) => {
          const checked = done.includes(item);
          return (
            <li key={item}>
              <button
                type="button"
                onClick={() => void toggle(item)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                    checked ? "border-leaf bg-leaf-soft text-leaf" : "border-border",
                  )}
                >
                  {checked && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className={cn(checked && "text-muted-foreground line-through")}>{item}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
