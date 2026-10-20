"use client";

import { DateField, TimeField } from "@/components/DateTimeField";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExternalLink, Globe, Loader2, MapPin, Phone, Search, UtensilsCrossed, X } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { DEFAULT_TABLE_TIME } from "@/lib/table-links";
import { tableOptions, type TablePlace } from "@/lib/table-providers";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { Reservation } from "@/packages/contracts/reservation";

export type RestaurantChoice = { providerId: string; name: string; address: string | null; mapsUrl: string | null };

const input = "w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-body outline-none transition-colors placeholder:text-muted-foreground focus:border-coral/40 focus:bg-coral-soft focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-coral)_14%,transparent)]";
const linkBtn = "daisy-btn daisy-btn-outline h-auto min-h-11 flex-1 gap-2 rounded-full border-border bg-card px-4 py-2 font-medium shadow-none hover:border-foreground/30 hover:bg-accent";

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}

const Heading = ({ children }: { children: ReactNode }) => <p className="text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{children}</p>;

/**
 * Reserve a table without leaving the trip. Find the restaurant (your saved places first, then a
 * Google search), say when and for how many, and get every way to book it that really works there:
 * call, its website, Google Maps, OpenTable (prefilled, only where it operates), and the popular
 * booking sites for that country. Nothing is booked from here; the traveller finishes on the site
 * or the phone, then can save the confirmation to the trip.
 */
export function TableSheet({
  tripId,
  open,
  destination,
  defaultDate,
  defaultParty,
  saved,
  onClose,
  onSaved,
}: {
  tripId: string;
  open: boolean;
  /** The trip's destination, e.g. "Lisbon, Portugal": the city searched, and the country fallback. */
  destination: string;
  defaultDate: string;
  defaultParty: number;
  /** Restaurants already saved to the trip, offered first because they cost no search. */
  saved: RestaurantChoice[];
  onClose: () => void;
  onSaved: (reservation: Reservation) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const city = destination.split(",")[0]?.trim() ?? "";
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<RestaurantChoice | null>(null);
  const [found, setFound] = useState<RestaurantChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [info, setInfo] = useState<TablePlace | null>(null);
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
    setPicked(null);
    setFound([]);
    setInfo(null);
    setDate(defaultDate);
    setTime(DEFAULT_TABLE_TIME);
    setParty(defaultParty);
    setNotes("");
    setOpened(false);
    setCode("");
  }, [open, defaultDate, defaultParty]);

  // Search Google for what they are typing, once they pause. Skipped once a restaurant is chosen.
  useEffect(() => {
    const text = name.trim();
    if (!open || picked || text.length < 3) {
      setFound([]);
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/trips/${tripId}/places?query=${encodeURIComponent(`${text} ${city}`.trim())}`, { signal: abort.signal })
        .then((r) => (r.ok ? r.json() : { places: [] }))
        .then((body: { places?: Array<{ providerId: string; name: string; address: string | null; sourceUrl: string | null }> }) =>
          setFound((body.places ?? []).slice(0, 5).map((p) => ({ providerId: p.providerId, name: p.name, address: p.address, mapsUrl: p.sourceUrl }))),
        )
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, 450);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [name, picked, open, tripId, city]);

  function choose(choice: RestaurantChoice) {
    setPicked(choice);
    setName(choice.name);
    setFound([]);
    setInfo({ name: choice.name, address: choice.address, mapsUrl: choice.mapsUrl });
    fetch(`/api/trips/${tripId}/places/table?placeId=${encodeURIComponent(choice.providerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { place?: TablePlace } | null) => {
        if (body?.place) setInfo({ ...body.place, name: body.place.name ?? choice.name, address: body.place.address ?? choice.address, mapsUrl: body.place.mapsUrl ?? choice.mapsUrl });
      })
      .catch(() => undefined);
  }

  function unchoose() {
    setPicked(null);
    setInfo(null);
  }

  const shownSaved = useMemo(() => {
    const text = name.trim().toLowerCase();
    return saved.filter((r) => !text || r.name.toLowerCase().includes(text)).slice(0, 4);
  }, [saved, name]);

  const ready = name.trim().length > 0;
  const search = { name: name.trim(), city, date, time, party };
  const options = tableOptions(search, destination, info ?? (ready ? { name: name.trim() } : null));
  const external = { target: "_blank", rel: "noopener noreferrer", onClick: () => setOpened(true) } as const;

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
          place: info?.address ?? (destination || null),
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
            <p>Find the restaurant, say when, and pick a way to book. We don&rsquo;t book for you: you finish on their site or by phone.</p>
          </div>

          {/* A div, not a <label>: a label forwards clicks to its first control, which would press "Change" right after a pick. */}
          <div>
            <span className="mb-1.5 block text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Restaurant</span>
            {picked ? (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{picked.name}</span>
                  {picked.address && <span className="block truncate text-xs text-muted-foreground">{picked.address}</span>}
                </span>
                <button type="button" onClick={unchoose} className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Change</button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder={city ? `Search restaurants in ${city}` : "Restaurant name"} className={cn(input, "pl-10")} />
                  {searching && <Loader2 className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
                {(shownSaved.length > 0 || found.length > 0) && (
                  <ul className="mt-2 overflow-hidden rounded-2xl border border-border bg-card">
                    {shownSaved.map((r) => (
                      <li key={`s-${r.providerId}`}>
                        <button type="button" onClick={() => choose(r)} className="flex w-full items-center gap-3 border-b border-border/70 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-accent">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{r.name}</span>
                            {r.address && <span className="block truncate text-xs text-muted-foreground">{r.address}</span>}
                          </span>
                          <span className="daisy-badge h-5 shrink-0 border-leaf/30 bg-leaf/10 px-2 text-2xs">Saved</span>
                        </button>
                      </li>
                    ))}
                    {found.filter((r) => !shownSaved.some((s) => s.providerId === r.providerId)).map((r) => (
                      <li key={`f-${r.providerId}`}>
                        <button type="button" onClick={() => choose(r)} className="flex w-full flex-col items-start border-b border-border/70 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-accent">
                          <span className="w-full truncate text-sm font-medium">{r.name}</span>
                          {r.address && <span className="w-full truncate text-xs text-muted-foreground">{r.address}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {name.trim().length >= 3 && !searching && found.length === 0 && shownSaved.length === 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">No match yet. You can still use &ldquo;{name.trim()}&rdquo; as typed below.</p>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <DateField value={date} onChange={setDate} />
            </Field>
            <Field label="Time">
              <TimeField value={time} onChange={setTime} />
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

          {ready && (
            <section aria-label="Ways to book" className="space-y-4 border-t border-border pt-5">
              <Heading>Ways to book</Heading>
              {options.mapsReserve && <p className="-mt-2 text-sm text-muted-foreground">Google lists this place as taking reservations. Its Maps page has a Reserve button.</p>}

              {options.prefilled && (
                <a href={options.prefilled.url} {...external} className="daisy-btn daisy-btn-neutral h-auto min-h-12 w-full flex-col gap-0 rounded-full border-0 py-2.5 shadow-none">
                  <span className="flex items-center gap-2">
                    Open {options.prefilled.name} <ExternalLink className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-normal opacity-70">Restaurant, guests, date and time filled in</span>
                </a>
              )}

              <div className="flex flex-wrap gap-2">
                {options.call && (
                  <a href={options.call.href} {...external} className={linkBtn}>
                    <Phone className="h-4 w-4" /> Call
                  </a>
                )}
                {options.website && (
                  <a href={options.website} {...external} className={linkBtn}>
                    <Globe className="h-4 w-4" /> Website
                  </a>
                )}
                <a href={options.maps} {...external} className={linkBtn}>
                  <MapPin className="h-4 w-4" /> Google Maps
                </a>
              </div>
              {options.call && <p className="-mt-2 text-xs text-muted-foreground">{options.call.label}</p>}

              {options.popular.length > 0 && (
                <div>
                  <Heading>Popular booking sites here</Heading>
                  <p className="mt-1 text-xs text-muted-foreground">These open the site&rsquo;s front page. Search for the restaurant there; nothing is filled in.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {options.popular.map((site) => (
                      <a key={site.id} href={site.url} {...external} className="daisy-badge h-8 gap-1.5 border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent">
                        {site.name} <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {opened && (
            <div className="space-y-3 rounded-3xl border border-leaf/30 bg-leaf/5 p-4">
              <p className="font-medium">Booked it?</p>
              <p className="-mt-2 text-sm text-muted-foreground">Add your confirmation number and we will keep it with the trip. You can leave it blank.</p>
              <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={80} placeholder="Confirmation number" className={cn(input, "font-mono text-sm")} />
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-4">
          <span className="text-xs text-muted-foreground">Saves as a dining reservation.</span>
          <button type="button" onClick={() => void save()} disabled={!ready || saving} className="daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-6 font-medium shadow-none">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save to my trip
          </button>
        </footer>
      </div>
    </Sheet>
  );
}
