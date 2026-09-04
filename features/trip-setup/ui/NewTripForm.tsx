"use client";

import { useState } from "react";
import { ArrowRight, Link2, Loader2 } from "lucide-react";

export function NewTripForm() {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<"trip" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createTrip() {
    if (busy) return;
    setBusy("trip"); setError(null);
    try {
      const response = await fetch("/api/trips", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Untitled trip", destination: null }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.trip?.id) throw new Error();
      window.location.assign(`/trips/${body.trip.id}/chat`);
    } catch { setError("We couldn’t open a new trip. Try again in a moment."); setBusy(null); }
  }

  async function importLink() {
    const url = link.trim();
    if (!url || busy) return;
    setBusy("link"); setError(null);
    try {
      const response = await fetch("/api/trips/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.tripId) throw new Error();
      window.location.assign(`/trips/${body.tripId}/chat`);
    } catch { setError("That link couldn’t be imported. Try starting with a conversation instead."); setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border/70 bg-surface/70 p-5 sm:p-7">
          <p className="eyebrow text-coral">A blank page, in the good way</p>
          <h2 className="mt-2 max-w-md font-display text-2xl leading-tight">One conversation. A trip that gets clearer as you go.</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">Start anywhere: a place, a date, a mood, or nothing decided yet. Roam will keep the useful details in view.</p>
          <button type="button" onClick={() => void createTrip()} disabled={Boolean(busy)} className="btn-primary mt-6 inline-flex items-center gap-2">
            {busy === "trip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Start planning
          </button>
        </div>
        <div className="p-5 sm:p-7">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Or bring a guide with you</div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring/25">
            <input type="url" value={link} onChange={(event) => setLink(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void importLink(); } }} placeholder="Paste a guide or itinerary link" className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground" />
            <button type="button" onClick={() => void importLink()} disabled={!link.trim() || Boolean(busy)} className="btn-primary-sm shrink-0">{busy === "link" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import"}</button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">We&rsquo;ll pull the useful places into a new conversation.</p>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
