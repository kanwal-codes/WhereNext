"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange, subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { useTripMembers } from "@/lib/client/use-trip-members";
import { cn } from "@/lib/utils";
import type { Overlap } from "../domain/overlap";

type Range = { id: string; startDate: string; endDate: string };
type AvailabilityRange = { id: string; userId: string; startDate: string; endDate: string };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response.json();
}

export function AvailabilityPanel({ tripId }: { tripId: string }) {
  const { members, loaded: membersLoaded } = useTripMembers(tripId);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [availabilityRanges, setAvailabilityRanges] = useState<AvailabilityRange[] | null>(null);
  const [myRanges, setMyRanges] = useState<Range[]>([{ id: crypto.randomUUID(), startDate: "", endDate: "" }]);
  const [overlaps, setOverlaps] = useState<Overlap[]>([]);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState<Overlap | null>(null);

  useEffect(() => {
    fetchJson<{ ranges: AvailabilityRange[]; overlaps: Overlap[] }>(`/api/trips/${tripId}/availability`)
      .then((availability) => {
        setAvailabilityRanges(availability.ranges);
        setOverlaps(availability.overlaps);
      })
      .catch(() => notifyToast("Couldn’t load availability.", "error"))
      .finally(() => setAvailabilityLoaded(true));

    // Another member submitting their own dates should update the shared overlap view live —
    // but never overwrite this viewer's own range inputs, which only ever change through their
    // own save() below (an in-progress, unsaved edit here must survive someone else's update).
    return subscribeWorkspaceChanges((changes) => {
      if (!changes.includes("availability")) return;
      fetchJson<{ overlaps: Overlap[] }>(`/api/trips/${tripId}/availability`)
        .then((body) => setOverlaps(body.overlaps))
        .catch(() => undefined);
    });
  }, [tripId]);

  // Seed the input state from the viewer's own saved ranges exactly once, as soon as both the
  // availability fetch and the (separately loading) member roster are ready — never again after
  // that, so a member joining later, or the roster simply re-rendering, can't clobber whatever
  // this viewer has since typed into the date inputs below.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !availabilityLoaded || !membersLoaded || availabilityRanges === null) return;
    seededRef.current = true;
    const myUserId = members.find((m) => m.isYou)?.userId;
    const mine = availabilityRanges.filter((r) => r.userId === myUserId);
    if (mine.length > 0) setMyRanges(mine.map((r) => ({ id: crypto.randomUUID(), startDate: r.startDate, endDate: r.endDate })));
  }, [availabilityLoaded, membersLoaded, availabilityRanges, members]);

  const loaded = availabilityLoaded && membersLoaded;
  const memberCount = members.length || 1;

  function updateRange(index: number, field: keyof Range, value: string) {
    setMyRanges((current) => current.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }
  function removeRange(index: number) {
    setMyRanges((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current));
  }

  async function save() {
    const complete = myRanges.filter((r) => r.startDate && r.endDate);
    if (complete.length === 0) {
      notifyToast("Add at least one date range.", "error");
      return;
    }
    // The two fields aren't linked to each other, so nothing stops picking an end date before
    // the start — the server correctly rejects it, but catch it here with a message that says
    // which thing is wrong instead of a generic "couldn't save".
    if (complete.some((r) => r.endDate < r.startDate)) {
      notifyToast("End date can’t be before the start date.", "error");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/trips/${tripId}/availability`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ranges: complete.map((r) => ({ startDate: r.startDate, endDate: r.endDate })) }),
      });
      if (!response.ok) throw new Error("save failed");
      const fresh = await fetchJson<{ overlaps: Overlap[] }>(`/api/trips/${tripId}/availability`);
      setOverlaps(fresh.overlaps);
      announceWorkspaceChange("availability");
      notifyToast("Your availability is saved.", "success");
    } catch {
      notifyToast("Couldn’t save your availability.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function lockDates(overlap: Overlap) {
    setLocking(overlap);
    try {
      const response = await fetch(`/api/trips/${tripId}/dates`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate: overlap.startDate, endDate: overlap.endDate }),
      });
      if (!response.ok) throw new Error("lock failed");
      announceWorkspaceChange("trip");
      notifyToast("Trip dates locked.", "success");
    } catch {
      notifyToast("Couldn’t lock these dates.", "error");
    } finally {
      setLocking(null);
    }
  }

  if (!loaded) {
    return <div className="space-y-3 px-5 pt-1 pb-6"><Skeleton className="h-9 w-full rounded-xl" /></div>;
  }

  return (
    <div className="space-y-6 px-5 pt-1 pb-6">
      <div>
        <p className="text-sm font-medium">Your availability</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Add every stretch of dates you could do — this doesn’t lock anything, it just shows the group where things overlap.</p>
        <div className="mt-3 space-y-2">
          {myRanges.map((range, index) => (
            <div key={range.id} className="flex items-center gap-2">
              <input type="date" value={range.startDate} onChange={(e) => updateRange(index, "startDate", e.target.value)} className="input-field flex-1 text-sm" aria-label="Start date" />
              <span className="text-muted-foreground">–</span>
              <input type="date" value={range.endDate} onChange={(e) => updateRange(index, "endDate", e.target.value)} className="input-field flex-1 text-sm" aria-label="End date" />
              {myRanges.length > 1 && (
                <button type="button" onClick={() => removeRange(index)} aria-label="Remove range" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setMyRanges((c) => [...c, { id: crypto.randomUUID(), startDate: "", endDate: "" }])} className="btn-chip mt-2 gap-1">
          <Plus className="h-3 w-3" /> Add another range
        </button>
        <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary-sm mt-3 w-full">
          {saving ? "Saving…" : "Save my availability"}
        </button>
      </div>

      <div>
        <p className="text-sm font-medium">Where everyone overlaps</p>
        {overlaps.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">No overlap yet — once a couple of people add their dates, this fills in.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {overlaps.map((overlap) => {
              const full = overlap.userIds.length >= memberCount;
              return (
                <li key={`${overlap.startDate}-${overlap.endDate}`} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm">{overlap.startDate} – {overlap.endDate}</p>
                    <span
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
                        full ? "bg-leaf-soft text-leaf border-leaf/30" : "bg-water-soft text-water border-water/30",
                      )}
                    >
                      {overlap.userIds.length}/{memberCount} available
                    </span>
                  </div>
                  <button type="button" onClick={() => void lockDates(overlap)} disabled={locking !== null} className="btn-primary-sm shrink-0">
                    {locking === overlap ? "Locking…" : "Lock these dates"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
