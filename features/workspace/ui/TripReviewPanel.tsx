"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { subscribeWorkspaceChanges, announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";

type Finding = {
  id: string;
  kind: string;
  severity: "info" | "warn";
  title: string;
  detail: string;
  deepLink?: string;
  askAssistant?: string;
};

/** Proactive "here's what to look at" list for a trip. Hidden when there's nothing to flag. */
export function TripReviewPanel({ tripId }: { tripId: string }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/trips/${tripId}/review`)
      .then((r) => (r.ok ? r.json() : { findings: [] }))
      .then((body: { findings?: Finding[] }) => setFindings(body.findings ?? []))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [tripId]);

  useEffect(() => {
    load();
    return subscribeWorkspaceChanges(load);
  }, [load]);

  async function dismiss(id: string) {
    setFindings((cur) => cur.filter((f) => f.id !== id));
    try {
      await fetch(`/api/trips/${tripId}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "review_dismissed", value: { id }, idempotencyKey: `review:${id}` }),
      });
      announceWorkspaceChange("decision");
    } catch {
      notifyToast("Couldn’t dismiss that.", "error");
      load();
    }
  }

  if (!loaded || findings.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <h2 className="font-display text-lg">Worth a look</h2>
      <ul className="mt-3 space-y-3">
        {findings.map((f) => {
          const Icon = f.severity === "warn" ? AlertTriangle : Info;
          return (
            <li key={f.id} className="rounded-xl border border-border/70 bg-background/60 p-3">
              <div className="flex items-start gap-2">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${f.severity === "warn" ? "text-coral" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {f.deepLink && (
                      <Link href={`/trips/${tripId}/${f.deepLink}`} className="font-medium text-primary hover:underline">
                        Open {f.deepLink}
                      </Link>
                    )}
                    {f.askAssistant && (
                      <Link href={`/trips/${tripId}/chat?ask=${encodeURIComponent(f.askAssistant)}`} className="font-medium text-primary hover:underline">
                        Ask about this
                      </Link>
                    )}
                    <button type="button" onClick={() => void dismiss(f.id)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" /> Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Check className="h-3 w-3" /> Updated as your plan changes
      </p>
    </section>
  );
}
