"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BedDouble, ClipboardPaste, FileText, ImageIcon, Loader2, Paperclip, Plane, Ticket, TrainFront, UtensilsCrossed, X, Sparkles } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { useMediaQuery } from "@/lib/use-media-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { MAX_CONFIRMATION_CHARS, type ReservationDraft } from "@/lib/reservation-draft";
import { RESERVATION_FILES_BUCKET, fileProblem, sizeLabel, type ReservationFile } from "@/lib/reservation-files";
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
  // Files already on the reservation, and (for a new one) files waiting for it to be created first.
  const [files, setFiles] = useState<ReservationFile[]>([]);
  const [staged, setStaged] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  // Paste a confirmation and let Roam read it into the form. It only fills the fields: the traveller reviews and saves.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFiles(editing?.attachments ?? []);
    setStaged([]);
    setFileError(null);
    setPasteOpen(false);
    setPasted("");
    setReadNote(null);
    setDraft(editing ? fromReservation(editing, defaultCurrency) : blank(defaultCurrency, defaultDate));
    setError(null);
  }, [open, editing, defaultCurrency, defaultDate]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  /** Send one file straight to storage with a one-time link from the API, then record it on the reservation. */
  async function uploadOne(reservationId: string, file: File): Promise<Reservation> {
    const base = `/api/trips/${tripId}/reservations/${reservationId}/files`;
    const init = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size, type: file.type }) });
    const initBody = await init.json().catch(() => ({}));
    if (!init.ok) throw new Error(initBody.error ?? "That file couldn't be uploaded.");
    const sent = await createSupabaseBrowserClient().storage.from(RESERVATION_FILES_BUCKET).uploadToSignedUrl(initBody.path, initBody.token, file, { contentType: file.type });
    if (sent.error) throw new Error("That file couldn't be uploaded.");
    const done = await fetch(base, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: initBody.path, name: file.name, size: file.size, type: file.type }) });
    const doneBody = await done.json().catch(() => ({}));
    if (!done.ok) throw new Error(doneBody.error ?? "That file couldn't be saved.");
    return doneBody.reservation as Reservation;
  }

  async function readConfirmation() {
    const text = pasted.trim();
    if (text.length < 10 || reading) return;
    setReading(true);
    setReadNote(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/reservations/parse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't read that. You can still fill it in by hand.");
      const found = body.draft as ReservationDraft;
      // Only fill what the confirmation actually said; keep whatever is already typed for the rest.
      setDraft((current) => ({ ...current, ...Object.fromEntries(Object.entries(found).filter(([, value]) => value !== "")) }) as Draft);
      setPasteOpen(false);
      setReadNote("Filled in from your confirmation. Check each field before you add it.");
    } catch (e) {
      setReadNote(e instanceof Error ? e.message : "Couldn't read that. You can still fill it in by hand.");
    } finally {
      setReading(false);
    }
  }

  async function pick(list: FileList | File[]) {
    const chosen = Array.from(list);
    if (chosen.length === 0) return;
    setFileError(null);
    let count = editing ? files.length : staged.length;
    const ok: File[] = [];
    for (const file of chosen) {
      const problem = fileProblem(file, count);
      if (problem) {
        setFileError(`${file.name}: ${problem}`);
        continue;
      }
      ok.push(file);
      count += 1;
    }
    if (ok.length === 0) return;
    if (!editing) return setStaged((current) => [...current, ...ok]);
    setUploading(true);
    try {
      for (const file of ok) {
        const updated = await uploadOne(editing.id, file);
        setFiles(updated.attachments);
        onSaved(updated);
      }
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "That file couldn't be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(file: ReservationFile) {
    if (!editing) return;
    setFileError(null);
    const res = await fetch(`/api/trips/${tripId}/reservations/${editing.id}/files`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: file.path }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setFileError(body.error ?? "That file couldn't be removed.");
    setFiles(body.reservation.attachments);
    onSaved(body.reservation as Reservation);
  }

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
      let saved = body.reservation as Reservation;
      let skipped = 0;
      for (const file of editing ? [] : staged) {
        try {
          saved = await uploadOne(saved.id, file);
        } catch {
          skipped += 1;
        }
      }
      announceWorkspaceChange("decision");
      onSaved(saved);
      if (skipped > 0) notifyToast(`Saved, but ${skipped} ${skipped === 1 ? "file" : "files"} didn't upload. Open it to try again.`, "error");
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
          {!editing && (
            <div className="rounded-2xl border border-dashed border-border bg-background">
              <button type="button" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium">
                <ClipboardPaste className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">Paste a confirmation and let Roam fill this in</span>
                <span className="text-xs font-normal text-muted-foreground">{pasteOpen ? "Close" : "Try it"}</span>
              </button>
              {pasteOpen && (
                <div className="space-y-3 border-t border-border px-4 py-4">
                  <textarea
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    maxLength={MAX_CONFIRMATION_CHARS}
                    rows={6}
                    placeholder="Paste the confirmation email or voucher text here"
                    className={cn(input, "resize-y text-sm")}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">Nothing is saved until you review it.</span>
                    <button type="button" onClick={() => void readConfirmation()} disabled={pasted.trim().length < 10 || reading} className="daisy-btn daisy-btn-neutral h-10 rounded-full border-0 px-5 shadow-none">
                      {reading && <Loader2 className="h-4 w-4 animate-spin" />}
                      Fill it in
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {readNote && <p role="status" className="-mt-2 text-sm text-muted-foreground">{readNote}</p>}

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

          <div>
            <span className="mb-1.5 block text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">Tickets and confirmations</span>
            <input ref={picker} type="file" multiple accept="application/pdf,image/*" className="sr-only" tabIndex={-1} onChange={(e) => { void pick(e.target.files ?? []); e.target.value = ""; }} />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files); }}
              disabled={uploading}
              className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border bg-background px-4 py-5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
              <span className="font-medium text-foreground">{uploading ? "Uploading…" : "Add a PDF or photo"}</span>
              <span className="text-xs">Tickets, vouchers, screenshots. Up to 10 MB each.</span>
            </button>
            {(files.length > 0 || staged.length > 0) && (
              <ul className="mt-3 space-y-2">
                {files.map((file) => (
                  <li key={file.path} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
                    {file.type === "application/pdf" ? <FileText className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <a href={`/api/trips/${tripId}/reservations/${editing?.id}/files?path=${encodeURIComponent(file.path)}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline">{file.name}</a>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{sizeLabel(file.size)}</span>
                    <button type="button" onClick={() => void removeFile(file)} aria-label={`Remove ${file.name}`} className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
                {staged.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-3 py-2.5">
                    {file.type === "application/pdf" ? <FileText className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">Uploads when you add it</span>
                    <button type="button" onClick={() => setStaged((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`} className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
            {fileError && <p role="alert" className="mt-2 text-sm text-destructive">{fileError}</p>}
          </div>

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
