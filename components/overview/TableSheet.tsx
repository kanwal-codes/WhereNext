"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Loader2, MapPin, UtensilsCrossed, X } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { DEFAULT_TABLE_TIME, mapsSearchUrl, openTableUrl } from "@/lib/table-links";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { Reservation } from "@/packages/contracts/reservation";

const input = "w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40";

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}

/**
 * Reserve a table in two steps: say where, when and for how many, and the booking site opens with
 * all of it filled in; then, once you have booked there, paste the confirmation and it is saved to
 * the trip. Nothing is booked from here. The traveller finishes on the restaurant site.
 */
export function TableSheet({
  tripId,
  open,
  city,
  defaultDate,
  defaultParty,
  onClose,
  onSaved,
}: {
  tripId: string;
  open: boolean;
  city: string;
  defaultDate: string;
  defaultParty: number;
  onClose: () => void;
  onSaved: (reservation: Reservation) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [name, setName] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(DEFAULT_TABLE_TIME);
  const [party, setParty] = useState(defaultParty);
  const [notes, setNotes] = useState("");
  const [opened, setOpened] = useState(false);
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDate(defaultDate);
    setTime(DEFAULT_TABLE_TIME);
    setParty(defaultParty);
    setNotes("");
    setOpened(false);
    setCode("");
  }, [open, defaultDate, defaultParty]);

  const search = { name, city, date, time, party };
  const ready = name.trim().length > 0;

  function openSite(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
    setOpened(true);
  }

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/reservations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "dining",
          title: name.trim(),
          startsOn: date || null,
          startTime: time || null,
          place: city || null,
          confirmationCode: code.trim() || null,
          notes: [`Table for ${party}`, notes.trim()].filter(Boolean).join(". "),
          amount: null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "That didn't save. Try again.");
      announceWorkspaceChange("decision");
      onSaved(body.reservation as Reservation);
      notifyToast("Saved to your trip.", "success");
      onClose();
    } catch (e) {
      notifyToast(e instanceof Error ? e.message : "That didn't save. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} side={desktop ? "right" : "bottom"} ariaLabel="Reserve a table">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="eyebrow">Dining</p>
            <p className="truncate font-display text-lg">Reserve a table</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain scrollbar-slim px-5 py-5">
          <div className="flex items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            <UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
            <p>Tell us where and when. We open OpenTable with it all filled in, and you finish the booking there.</p>
          </div>

          <Field label="Restaurant">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder="Ramiro" className={input} />
            {city && (
              <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> Searching in {city}
              </span>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            </Field>
            <Field label="Time">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
            </Field>
          </div>

          <Field label="Party size">
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Fewer guests" onClick={() => setParty((p) => Math.max(1, p - 1))} className="grid h-11 w-11 place-items-center rounded-full border border-border text-lg transition-colors hover:bg-accent">−</button>
              <span className="w-10 text-center font-display text-2xl tabular-nums" aria-live="polite">{party}</span>
              <button type="button" aria-label="More guests" onClick={() => setParty((p) => Math.min(20, p + 1))} className="grid h-11 w-11 place-items-center rounded-full border border-border text-lg transition-colors hover:bg-accent">+</button>
              <span className="text-sm text-muted-foreground">{party === 1 ? "guest" : "guests"}</span>
            </div>
          </Field>

          <Field label="Notes for yourself">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={400} rows={2} placeholder="Window seat, allergy, birthday" className={cn(input, "resize-none")} />
          </Field>

          <div className="space-y-2.5">
            <button type="button" disabled={!ready} onClick={() => openSite(openTableUrl(search))} className="daisy-btn daisy-btn-neutral h-12 w-full rounded-full border-0 shadow-none">
              Open OpenTable <ExternalLink className="h-4 w-4" />
            </button>
            <button type="button" disabled={!ready} onClick={() => openSite(mapsSearchUrl(search))} className="daisy-btn daisy-btn-outline h-11 w-full rounded-full border-border bg-card font-medium shadow-none">
              Not on OpenTable? Find it on Google Maps
            </button>
          </div>

          {opened && (
            <div className="space-y-3 rounded-3xl border border-leaf/30 bg-leaf/5 p-4">
              <p className="font-medium">Booked it?</p>
              <p className="-mt-2 text-sm text-muted-foreground">Add your confirmation number and we will keep it with the trip. You can leave it blank.</p>
              <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={80} placeholder="Confirmation number" className={cn(input, "font-mono text-sm")} />
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-4">
          <span className="text-xs text-muted-foreground">{opened ? "Saves as a dining reservation." : "Or save it now and book later."}</span>
          <button type="button" onClick={() => void save()} disabled={!ready || saving} className="daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-6 font-medium shadow-none">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save to my trip
          </button>
        </footer>
      </div>
    </Sheet>
  );
}
