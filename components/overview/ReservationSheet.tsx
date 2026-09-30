"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { BedDouble, Loader2, Plane, Ticket, TrainFront, UtensilsCrossed, X, Sparkles } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { Reservation, ReservationKind } from "@/packages/contracts/reservation";

export const KIND_META: Record<ReservationKind, { label: string; icon: typeof Plane; titleHint: string }> = {
  stay: { label: "Stay", icon: BedDouble, titleHint: "Hotel or apartment name" },
  flight: { label: "Flight", icon: Plane, titleHint: "Toronto to Lisbon, TAP 1350" },
  train: { label: "Train", icon: TrainFront, titleHint: "Lisbon to Porto, Alfa Pendular" },
  activity: { label: "Activity", icon: Ticket, titleHint: "Sintra palaces tour" },
  dining: { label: "Dining", icon: UtensilsCrossed, titleHint: "Dinner at Ramiro" },
  other: { label: "Other", icon: Sparkles, titleHint: "What is it?" },
};
const KINDS = Object.keys(KIND_META) as ReservationKind[];

type Draft = { kind: ReservationKind; title: string; startsOn: string; endsOn: string; startTime: string; place: string; confirmationCode: string; amount: string; currency: string; notes: string };

const blank = (currency: string, startsOn: string): Draft => ({ kind: "activity", title: "", startsOn, endsOn: "", startTime: "", place: "", confirmationCode: "", amount: "", currency, notes: "" });
const fromReservation = (r: Reservation, currency: string): Draft => ({
  kind: r.kind,
  title: r.title,
  startsOn: r.startsOn ?? "",
  endsOn: r.endsOn ?? "",
  startTime: r.startTime ?? "",
  place: r.place ?? "",
  confirmationCode: r.confirmationCode ?? "",
  amount: r.amount == null ? "" : String(r.amount),
  currency: r.currency ?? currency,
  notes: r.notes ?? "",
});

const input = "w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40";

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}

/** Add a reservation, or edit or remove one that was entered by hand. `editing` null means a new one. */
export function ReservationSheet({
  tripId,
  open,
  editing,
  defaultCurrency,
  defaultDate,
  onClose,
  onSaved,
  onDeleted,
}: {
  tripId: string;
  open: boolean;
  editing: Reservation | null;
  defaultCurrency: string;
  defaultDate: string;
  onClose: () => void;
  onSaved: (reservation: Reservation) => void;
  onDeleted: (id: string) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [draft, setDraft] = useState<Draft>(() => blank(defaultCurrency, defaultDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(editing ? fromReservation(editing, defaultCurrency) : blank(defaultCurrency, defaultDate));
    setError(null);
  }, [open, editing, defaultCurrency, defaultDate]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/reservations${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, amount: draft.amount === "" ? null : Number(draft.amount) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "That didn't save. Try again.");
      announceWorkspaceChange("decision");
      onSaved(body.reservation as Reservation);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/reservations/${editing.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("remove failed");
      announceWorkspaceChange("decision");
      onDeleted(editing.id);
      onClose();
    } catch {
      notifyToast("Couldn't remove that. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} side={desktop ? "right" : "bottom"} ariaLabel={editing ? "Edit reservation" : "Add a reservation"}>
      <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="eyebrow">{editing ? "Edit" : "New"}</p>
            <p className="truncate font-display text-lg">{editing ? "Reservation" : "Add a reservation"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain scrollbar-slim px-5 py-5">
          <div role="radiogroup" aria-label="What kind of reservation" className="grid grid-cols-3 gap-2">
            {KINDS.map((kind) => {
              const Icon = KIND_META[kind].icon;
              const on = draft.kind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("kind", kind)}
                  className={cn("flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition-colors", on ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent")}
                >
                  <Icon className="h-4 w-4" />
                  {KIND_META[kind].label}
                </button>
              );
            })}
          </div>

          <Field label="Name">
            <input required autoFocus value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={160} placeholder={KIND_META[draft.kind].titleHint} className={input} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={draft.kind === "stay" ? "Check-in" : "Date"}>
              <input type="date" value={draft.startsOn} onChange={(e) => set("startsOn", e.target.value)} className={input} />
            </Field>
            <Field label={draft.kind === "stay" ? "Check-out" : "Until (optional)"}>
              <input type="date" value={draft.endsOn} min={draft.startsOn || undefined} onChange={(e) => set("endsOn", e.target.value)} className={input} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Time (optional)">
              <input type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} className={input} />
            </Field>
            <Field label="Confirmation">
              <input value={draft.confirmationCode} onChange={(e) => set("confirmationCode", e.target.value)} maxLength={80} placeholder="Booking reference" className={cn(input, "font-mono text-sm")} />
            </Field>
          </div>

          <Field label="Where">
            <input value={draft.place} onChange={(e) => set("place", e.target.value)} maxLength={200} placeholder="Address or meeting point" className={input} />
          </Field>

          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <Field label="Price">
              <input type="number" min={0} step="any" inputMode="decimal" value={draft.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" className={cn(input, "tabular-nums")} />
            </Field>
            <Field label="Currency">
              <input value={draft.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={8} className={cn(input, "uppercase")} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} maxLength={1000} rows={3} placeholder="Gate code, what to bring, who is coming" className={cn(input, "resize-none")} />
          </Field>

          {error && (
            <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-4">
          {editing ? (
            <button type="button" onClick={() => void remove()} disabled={saving} className="text-sm font-medium text-destructive hover:underline disabled:opacity-50">
              Remove
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={saving || !draft.title.trim()} className="daisy-btn daisy-btn-neutral h-11 rounded-full border-0 px-7 shadow-none">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Add it"}
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
