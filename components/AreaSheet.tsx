"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { PickerRow } from "@/components/PickerSheet";
import type { Suggestion } from "@/components/DestinationCombobox";
import { popularAreasFor } from "@/lib/popular-areas";
import type { TripArea } from "@/lib/client/use-trip-city";
import { isBroadPlace, type TripStop } from "@/lib/trip-stops";
import { useMediaQuery } from "@/lib/use-media-query";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const lead = <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden />;

type Row = { key: string; area: TripArea; sub?: string };

/**
 * "Where in Portugal?": narrow a trip whose place is too big to search as one (a country, a state, a famous region) to a place inside it, so
 * Stay and Discover are centred on Porto instead of the middle of the country. The first rows are the usual places inside it (no typing);
 * typing searches within it; "Anywhere in Portugal" goes back to the whole place. On a trip with several cities the same sheet also lists the
 * stops, because picking another city and narrowing the current one are the same question: where is this screen about?
 */
export function AreaSheet({ open, onClose, tripId, parent, stops, activeStop, area, onPickStop, onPickArea, narrow }: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  /** The place being narrowed: the current stop, or the trip's destination. */
  parent: string;
  stops: TripStop[];
  activeStop: string;
  area: TripArea | null;
  onPickStop: (city: string) => void;
  onPickArea: (area: TripArea | null) => void;
  /** The current stop is broad, so there is something to narrow. Without it the sheet is only the list of stops. */
  narrow: boolean;
}) {
  const phone = useMediaQuery("(max-width: 1023.98px)");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Row[] | null>(null);
  const [searching, setSearching] = useState(false);
  const typed = query.trim();
  const inside = parent.split(",")[0]!.trim();

  useEffect(() => {
    if (!open) { setQuery(""); setFound(null); }
  }, [open]);

  // Typing searches inside the place: the place's name rides along ("Port, Portugal"), and anything that came back from elsewhere is dropped.
  useEffect(() => {
    if (!narrow || typed.length < 2) { setFound(null); setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/trips/${tripId}/places/google/autocomplete?query=${encodeURIComponent(`${typed}, ${inside}`)}`, { signal: controller.signal });
        const body = r.ok ? ((await r.json()) as { suggestions?: Suggestion[] }) : { suggestions: [] };
        const rows = (body.suggestions ?? [])
          .filter((s) => `${s.fullText ?? ""} ${s.secondaryText ?? ""}`.toLowerCase().includes(inside.toLowerCase()))
          .map<Row>((s) => ({ key: s.placeId, area: { name: s.text, text: s.fullText ?? [s.text, s.secondaryText].filter(Boolean).join(", ") }, sub: s.secondaryText ?? undefined }));
        setFound(rows);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setFound([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [typed, narrow, tripId, inside]);

  const popular = useMemo<Row[]>(() => popularAreasFor(inside).map((name) => ({ key: `p:${name}`, area: { name, text: `${name}, ${inside}` } })), [inside]);
  const rows = found ?? (typed.length >= 2 ? [] : popular);
  // A typed name nothing matched is still a name: "you can still enter it as typed", as in every other place field.
  const asTyped: Row | null = typed.length >= 2 && !searching && (found?.length ?? 0) === 0 ? { key: "typed", area: { name: typed, text: `${typed}, ${inside}` }, sub: `Search ${inside} for “${typed}”` } : null;
  const pick = (row: Row) => { onPickArea(row.area); onClose(); };

  const several = stops.length > 1;
  const heading = "pb-3 pt-1 font-display text-xl font-medium tracking-[-0.02em]";
  const stopSub = (st: TripStop) => (st.startDate && st.endDate ? `${day(st.startDate)} to ${day(st.endDate)}` : undefined);

  return (
    <Sheet open={open} onClose={onClose} side={phone ? "bottom" : "center"} ariaLabel={narrow ? `Where in ${inside}` : "Choose a city"} padded className="max-h-[78dvh] lg:p-5">
      <p className={heading}>{narrow && !several ? `Where in ${inside}?` : "Where in the trip?"}</p>
      {several && narrow && (
        // The stops are the first half of the question and sit on one strip, like tabs: the one you are in is ink, and everything under it is about that stop.
        <div role="group" aria-label="Trip stops" className="no-scrollbar -mx-4 mb-4 flex shrink-0 gap-2 overflow-x-auto px-4 pb-1">
          {stops.map((s) => (
            <button
              key={s.city}
              type="button"
              aria-pressed={s.city === activeStop}
              // A country on the strip stays open so its places are next; a city has nothing under it, so choosing it is the whole answer.
              onClick={() => { onPickStop(s.city); if (!isBroadPlace(s.city)) onClose(); }}
              className="btn-chip h-auto min-h-11 shrink-0 flex-col items-start justify-center gap-0 py-1.5 text-left"
            >
              <span className="text-body font-semibold leading-5">{s.city}</span>
              {stopSub(s) && <span className="text-2xs font-normal leading-4 opacity-70">{stopSub(s)}</span>}
            </button>
          ))}
        </div>
      )}
      {several && !narrow && (
        <ul className="grid gap-1.5">
          {stops.map((s) => (
            <li key={s.city}>
              <PickerRow on={s.city === activeStop && !area} label={s.city} sub={stopSub(s)} onClick={() => { onPickStop(s.city); onClose(); }} />
            </li>
          ))}
        </ul>
      )}
      {narrow && (
        <div className="scrollbar-slim flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <label className="relative mb-2 block">
            <span className="sr-only">Search in {inside}</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`A city or area in ${inside}`}
              className="h-12 w-full rounded-full bg-muted pr-11 pl-11 text-base outline-none transition-shadow placeholder:text-muted-foreground focus:bg-card focus:shadow-halo"
            />
            {searching && <Loader2 className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
          </label>
          <ul className="grid gap-1.5" aria-label={`Places in ${inside}`}>
            {typed.length < 2 && (
              <li>
                <PickerRow on={!area} lead={lead} label={`Anywhere in ${inside}`} onClick={() => { onPickArea(null); onClose(); }} />
              </li>
            )}
            {rows.map((row) => (
              <li key={row.key}>
                <PickerRow on={area?.text === row.area.text} lead={lead} label={row.area.name} sub={row.sub} onClick={() => pick(row)} />
              </li>
            ))}
            {asTyped && (
              <li>
                <PickerRow on={false} lead={lead} label={`Use “${asTyped.area.name}”`} sub={asTyped.sub} onClick={() => pick(asTyped)} />
              </li>
            )}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
