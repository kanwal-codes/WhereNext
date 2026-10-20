"use client";

import { ChevronRight } from "lucide-react";
import { controlSecondary } from "./blocks/ui";

/** Roam asks before it changes the trip: what it would do, the exact rows if you want them, and Confirm or Cancel. */
export function ProposalCard({ text, rows, confirming, onConfirm, onCancel }: {
  text: string;
  rows: Array<[string, string]>;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="region" aria-label="Confirm change" className="rounded-2xl border border-border bg-card p-4 shadow-soft">

    <p className="text-sm leading-relaxed">{text}</p>
    {rows.length > 0 && (
      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
          See exactly what will be saved
        </summary>
        <dl className="mt-1.5 space-y-1 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs leading-relaxed">
          {rows.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <dt className="w-24 shrink-0 font-medium text-muted-foreground">{key}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    )}
    <div className="mt-4 flex items-center gap-2">
      <button type="button" onClick={onConfirm} disabled={confirming} className="btn-primary-sm">
        {confirming ? "Saving…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={confirming}
        className={controlSecondary}
      >
        Cancel
      </button>
    </div>
    </div>
  );
}
