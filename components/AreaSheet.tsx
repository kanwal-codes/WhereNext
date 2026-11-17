"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { SuggestionRow } from "@/components/SuggestionRow";
import { Sheet } from "@/components/motion-primitives";
import { PickerRow } from "@/components/PickerSheet";
import { SheetHeader } from "@/components/SheetHeader";
import type { Suggestion } from "@/components/DestinationCombobox";
import { popularAreasFor } from "@/lib/popular-areas";
import type { TripArea } from "@/lib/client/use-trip-city";
import { isBroadPlace, type TripStop } from "@/lib/trip-stops";
import { useMediaQuery } from "@/lib/use-media-query";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const lead = <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden />;

type Row = { key: string; area: TripArea; sub?: string };

/** Accents and case do not matter when matching a typed name: "sao" finds "São Paulo". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
/** Searches already answered this session, so backspacing or retyping a name is instant. */
const answered = new Map<string, Row[]>();

/** The shape of a row while its answer is on the way. */
function RowSkeleton() {
  return (
    <div aria-hidden className="flex min-h-14 items-center gap-3.5 px-3.5 py-3">
      <Skeleton className="size-5 rounded-full" />
      <Skeleton className="h-4 w-2/5 rounded-full" />
    </div>
  );
}

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
  // What the rows in `found` answered: while a newer name is on its way they are still shown (the ones that still fit), not wiped.
  const [foundFor, setFoundFor] = useState("");
  const [searching, setSearching] = useState(false);
  const typed = query.trim();
  const inside = parent.split(",")[0]!.trim();

  useEffect(() => {
    if (!open) { setQuery(""); setFound(null); setFoundFor(""); }
  }, [open]);

  // Typing searches inside the place: the place's name rides along ("Port, Portugal"), and anything that came back from elsewhere is dropped.
  useEffect(() => {
    if (!narrow || typed.length < 2) { setFound(null); setFoundFor(""); setSearching(false); return; }
    const cacheKey = `${tripId}|${inside}|${fold(typed)}`;
    const hit = answered.get(cacheKey);
    if (hit) { setFound(hit); setFoundFor(typed); setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/trips/${tripId}/places/google/autocomplete?query=${encodeURIComponent(`${typed}, ${inside}`)}`, { signal: controller.signal });
        const body = r.ok ? ((await r.json()) as { suggestions?: Suggestion[] }) : { suggestions: [] };
        const rows = (body.suggestions ?? [])
          .filter((s) => `${s.fullText ?? ""} ${s.secondaryText ?? ""}`.toLowerCase().includes(inside.toLowerCase()))
          // The place itself ("Portugal" for "por") is not somewhere in it.
          .filter((s) => fold(s.text) !== fold(inside))
          .map<Row>((s) => ({ key: s.placeId, area: { name: s.text, text: s.fullText ?? [s.text, s.secondaryText].filter(Boolean).join(", ") }, sub: s.secondaryText ?? undefined }));
        if (r.ok) answered.set(cacheKey, rows);
        setFound(rows);
        setFoundFor(typed);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) { setFound([]); setFoundFor(typed); }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 160);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [typed, narrow, tripId, inside]);

  const popular = useMemo<Row[]>(() => popularAreasFor(inside).map((name) => ({ key: `p:${name}`, area: { name, text: `${name}, ${inside}` } })), [inside]);
  // While typing, the usual places that match are there at once, with no wait for the search: "po" shows Porto before the network has said anything.
  const local = useMemo<Row[]>(() => {
    const q = fold(typed);
    if (q.length < 2) return [];
    const hits = popular.filter((row) => fold(row.area.name).includes(q));
    return [...hits.filter((row) => fold(row.area.name).startsWith(q)), ...hits.filter((row) => !fold(row.area.name).startsWith(q))];
  }, [popular, typed]);
  // The search's own answer follows. One for an earlier, shorter name is kept only for the rows that still fit what is typed, until the new one lands.
  const settled = foundFor === typed;
  const remote = (found ?? []).filter((row) => settled || fold(row.area.name).includes(fold(typed)));
  const rows = typed.length >= 2 ? [...local, ...remote.filter((row) => !local.some((l) => fold(l.area.name) === fold(row.area.name)))] : popular;
  // A typed name nothing matched is still a name: "you can still enter it as typed", as in every other place field.
  const asTyped: Row | null = typed.length >= 2 && !searching && rows.length === 0 ? { key: "typed", area: { name: typed, text: `${typed}, ${inside}` }, sub: `Search ${inside} for “${typed}”` } : null;
  const pick = (row: Row) => { onPickArea(row.area); onClose(); };

  const several = stops.length > 1;
  const stopSub = (st: TripStop) => (st.startDate && st.endDate ? `${day(st.startDate)} to ${day(st.endDate)}` : undefined);
  const field = useRef<HTMLInputElement>(null);

  // Only the list of stops (the place is already a city): a plain choice, so a bottom sheet like every other picker.
  if (!narrow) {
    return (
      <Sheet open={open} onClose={onClose} side={phone ? "bottom" : "center"} ariaLabel="Choose a city" padded className="max-h-[78dvh] lg:p-5">
        <p className="pb-3 pt-1 font-display text-xl font-medium tracking-[-0.02em]">Where in the trip?</p>
        {several && (
          <ul className="grid gap-1.5">
            {stops.map((st) => (
              <li key={st.city}>
                <PickerRow on={st.city === activeStop && !area} label={st.city} sub={stopSub(st)} onClick={() => { onPickStop(st.city); onClose(); }} />
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    );
  }

  // Narrowing a big place is a search with a few usual answers, so it opens the way Directions does: from the top, with the field first and the
  // keyboard never covering the answers. The usual places are chips (the one chosen is ink); typing swaps them for the matching rows.
  return (
    <Sheet open={open} onClose={onClose} side={phone ? "top" : "center"} ariaLabel={`Where in ${inside}`} initialFocus={field} className="icons-fine lg:p-5">
      <SheetHeader title={several ? "Where in the trip?" : `Where in ${inside}?`} onClose={onClose} bordered={false} />
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 lg:px-0 lg:pb-0">
        {several && (
          // The stops are the first half of the question and sit on one strip, like tabs: the one you are in is ink, and everything under it is about that stop.
          <div role="group" aria-label="Trip stops" className="no-scrollbar -mx-4 mb-3 flex shrink-0 gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
            {stops.map((st) => (
              <button
                key={st.city}
                type="button"
                aria-pressed={st.city === activeStop}
                // A country on the strip stays open so its places are next; a city has nothing under it, so choosing it is the whole answer.
                onClick={() => { onPickStop(st.city); if (!isBroadPlace(st.city)) onClose(); }}
                className="btn-chip h-auto min-h-11 shrink-0 flex-col items-start justify-center gap-0 py-1.5 text-left"
              >
                <span className="text-body font-semibold leading-5">{st.city}</span>
                {stopSub(st) && <span className="text-2xs font-normal leading-4 opacity-70">{stopSub(st)}</span>}
              </button>
            ))}
          </div>
        )}
        <label className="relative block">
          <span className="sr-only">Search in {inside}</span>
          <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 ring-1 ring-border transition-shadow focus-within:bg-card focus-within:ring-2 focus-within:ring-ink/80">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={field}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`A city or area in ${inside}`}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
            />
            {searching && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
          </div>
        </label>

        {typed.length < 2 ? (
          <SuggestionRow bleed label={`Places in ${inside}`} className="mt-4">
            <button type="button" aria-pressed={!area} onClick={() => { onPickArea(null); onClose(); }} className="btn-chip whitespace-nowrap max-lg:h-10">
              <MapPin className="size-3.5" aria-hidden />
              Anywhere in {inside}
            </button>
            {popular.map((row) => (
              <button key={row.key} type="button" aria-pressed={area?.text === row.area.text} onClick={() => pick(row)} className="btn-chip whitespace-nowrap max-lg:h-10">{row.area.name}</button>
            ))}
          </SuggestionRow>
        ) : (
          // The room for the answers is kept while they load, so the sheet does not jump as they arrive.
          <ul className="mt-2 grid min-h-[13rem] content-start gap-1.5" aria-label={`Places in ${inside}`} aria-busy={searching}>
            {rows.map((row) => (
              // Rows kept from an earlier name sit back a little while the newer answer loads.
              <li key={row.key} className={searching && !settled && !local.includes(row) ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <PickerRow on={area?.text === row.area.text} lead={lead} label={row.area.name} sub={row.sub} onClick={() => pick(row)} />
              </li>
            ))}
            {searching && rows.length === 0 && [0, 1, 2].map((i) => <li key={`sk${i}`}><RowSkeleton /></li>)}
            {searching && rows.length > 0 && <li><RowSkeleton /></li>}
            {asTyped && (
              <li>
                <PickerRow on={false} lead={lead} label={`Use “${asTyped.area.name}”`} sub={asTyped.sub} onClick={() => pick(asTyped)} />
              </li>
            )}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
