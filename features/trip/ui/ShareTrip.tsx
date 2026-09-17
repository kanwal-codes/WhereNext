"use client";

import { useEffect, useState } from "react";
import { Check, Link2, Loader2 } from "lucide-react";
import { notifyToast } from "@/lib/application/toast";

export function ShareTrip({ tripId }: { tripId: string }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trips/${tripId}/share`)
      .then((r) => (r.ok ? r.json() : { slug: null }))
      .then((body) => { if (!cancelled) setSlug(body.slug ?? null); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [tripId]);

  const url = slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${slug}` : "";

  async function enable() {
    setBusy(true);
    try {
      const r = await fetch(`/api/trips/${tripId}/share`, { method: "POST" });
      const body = await r.json();
      if (!r.ok || !body.slug) throw new Error();
      setSlug(body.slug);
    } catch {
      notifyToast("Couldn’t create a share link.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const r = await fetch(`/api/trips/${tripId}/share`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setSlug(null);
    } catch {
      notifyToast("Couldn’t turn off the link.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notifyToast("Copy failed — select the link manually.", "error");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <h2 className="flex items-center gap-2 font-display text-lg">
        <Link2 className="h-4 w-4 text-coral" /> Share this trip
      </h2>
      {!loaded ? (
        <div className="mt-4 h-10 animate-pulse rounded-full bg-muted" />
      ) : !slug ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">Create an unlisted link to a read-only view of the itinerary.</p>
          <button type="button" onClick={() => void enable()} disabled={busy} className="btn-primary mt-4 w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create share link"}
          </button>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring/25">
            <input aria-label="Share link" name="share-link" readOnly value={url} className="min-w-0 flex-1 bg-transparent text-xs outline-none" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={() => void copy()} className="shrink-0 text-xs font-medium text-primary">
              {copied ? <Check className="h-3.5 w-3.5" /> : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Anyone with the link can view it. It’s not indexed.</p>
          <button type="button" onClick={() => void disable()} disabled={busy} className="mt-3 text-xs font-medium text-destructive hover:underline">
            {busy ? "…" : "Turn off link"}
          </button>
        </>
      )}
    </section>
  );
}
