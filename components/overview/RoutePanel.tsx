"use client";

import { DateField } from "@/components/DateTimeField";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { SectionHeading } from "@/components/overview/SectionHeading";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { effectiveStops, stopsFromStays, type TripStop } from "@/lib/trip-stops";
import { cn } from "@/lib/utils";

type TripLike = { destination?: string | null; start_date?: string | null; end_date?: string | null; stops?: unknown };

const field = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/40";

/**
 * The cities of a multi-city trip and the days in each, editable. Discover, Stay and the plan read from here, so a
 * trip through five countries searches one city at a time. Until someone sets it, the days are an even split.
 */
export function RoutePanel({ tripId, trip, stays = [] }: { tripId: string; trip: TripLike; /** The booked stays (dates only): when there is one per city they can fill the route in. */ stays?: Array<{ startsOn: string | null; endsOn: string | null }> }) {
  const { stops, estimated } = effectiveStops(trip);
  const [draft, setDraft] = useState<TripStop[]>(stops);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fromStays = estimated ? stopsFromStays(trip.destination, stays, trip.start_date, trip.end_date) : null;
  const signature = JSON.stringify(stops);
  useEffect(() => {
    if (!editing) setDraft(stops);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands for `stops`
  }, [signature, editing]);

  if (stops.length < 2 && !editing) return null;

  const set = (i: number, patch: Partial<TripStop>) => setDraft((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save(next: TripStop[] | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/trips/${tripId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stops: next }) });
      if (!res.ok) throw new Error();
      announceWorkspaceChange("trip");
      setEditing(false);
    } catch {
      notifyToast("The route didn’t save. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const problem = draft.some((r) => !r.city.trim()) ? "Every stop needs a city." : draft.some((r) => r.startDate && r.endDate && r.endDate < r.startDate) ? "A stop ends before it starts." : null;

  return (
    <section aria-label="Route">
      <SectionHeading title="The route" />
      <div className="mt-5 rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
        {!editing ? (
          <>
            <ol className="flex flex-wrap gap-x-6 gap-y-3">
              {stops.map((s) => (
                <li key={s.city} className="min-w-0">
                  <p className="font-display text-lg leading-tight">{s.city}</p>
                  <p suppressHydrationWarning className="text-xs text-muted-foreground tabular-nums">
                    {s.startDate && s.endDate ? `${fmt(s.startDate)} to ${fmt(s.endDate)}` : "no dates yet"}
                  </p>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setEditing(true)} className="btn-chip">{estimated ? "Set the days in each city" : "Edit the route"}</button>
              {fromStays && <button type="button" onClick={() => { setDraft(fromStays); setEditing(true); }} className="btn-chip">Use my booked stays</button>}
              {estimated && <p className="text-xs text-muted-foreground">These days are an even split. Discover, Stay and the plan use them.</p>}
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!problem) void save(draft.map((r) => ({ city: r.city.trim(), startDate: r.startDate || null, endDate: r.endDate || null })));
            }}
            className="space-y-3"
          >
            <p className="text-xs text-muted-foreground">Each city runs from the day you arrive to the day you leave. The day you leave is the next city&rsquo;s first day.</p>
            {draft.map((row, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="col-span-2 block sm:col-span-1">
                  <span className="sr-only">City {i + 1}</span>
                  <input value={row.city} onChange={(e) => set(i, { city: e.target.value })} maxLength={80} placeholder="City" className={field} />
                </label>
                <label className="block">
                  <span className="sr-only">Arrive</span>
                  <DateField value={row.startDate ?? ""} onChange={(v) => set(i, { startDate: v || null })} placeholder="Arrive" ariaLabel="Arrive" />
                </label>
                <label className="block">
                  <span className="sr-only">Leave</span>
                  <DateField value={row.endDate ?? ""} min={row.startDate ?? undefined} onChange={(v) => set(i, { endDate: v || null })} placeholder="Leave" ariaLabel="Leave" />
                </label>
                <button type="button" onClick={() => setDraft((rows) => rows.filter((_, j) => j !== i))} aria-label={`Remove ${row.city || "this stop"}`} disabled={draft.length <= 1} className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setDraft((rows) => [...rows, { city: "", startDate: rows[rows.length - 1]?.endDate ?? null, endDate: null }])} disabled={draft.length >= 20} className="btn-chip">
              <Plus className="size-3.5" aria-hidden /> Add a city
            </button>
            {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" disabled={saving || Boolean(problem)} className={cn("daisy-btn daisy-btn-neutral h-10 rounded-full border-0 px-6 shadow-none")}>{saving ? "Saving…" : "Save route"}</button>
              <button type="button" onClick={() => { setDraft(stops); setEditing(false); }} disabled={saving} className="btn-chip">Cancel</button>
              {!estimated && <button type="button" onClick={() => void save(null)} disabled={saving} className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">Go back to an even split</button>}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

const fmt = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
