"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CalendarDays, Check, Clock, Copy, ExternalLink, LocateFixed, MapPin, Minus, Phone, Plus, Search, SearchX, Users, Utensils, WifiOff, X } from "lucide-react";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { FoldAway } from "@/components/FoldAway";
import { Sheet } from "@/components/motion-primitives";
import { searchButton } from "@/components/motion/sheetActions";
import { PlaceDetailView } from "@/features/places/ui/PlaceDetailView";
import { SheetHeader } from "@/components/SheetHeader";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { SkeletonBand } from "@/components/Skeleton";
import { StandaloneHeader } from "@/components/StandaloneHeader";
import { StateMessage, stateButton } from "@/components/StateMessage";
import { applyEatView, availableEat, DEFAULT_EAT_VIEW, type EatView } from "@/features/eat/domain/eat-view";
import { fmtTime, LARGE_GROUP, MAX_GUESTS, NO_VISIT, openAt, requestText, visitLine, visitNote, visitSet, visitTimed, type Visit } from "@/features/eat/domain/eat-visit";
import { EatFilters } from "@/features/eat/ui/EatFilters";
import { placeGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { CATEGORY_BY_KEY } from "@/features/places/ui/discoverTaxonomy";
import { DiscoverTile } from "@/features/places/ui/DiscoverTile";
import { cachedGet } from "@/lib/client/cached-get";
import { accountPhotoUrl, categoryLabel, isFoodPlace, priceLabel } from "@/lib/places-ui";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { useShowMore } from "@/lib/use-show-more";
import type { Place } from "@/packages/contracts/place";

const EAT = CATEGORY_BY_KEY.get("eat")!;
/** Google place types that mean "somewhere to look around", not one named place. */
const AREA_TYPES = ["locality", "sublocality", "sublocality_level_1", "neighborhood", "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3", "country", "postal_town", "political", "colloquial_area"];
type Table = { name: string | null; address: string | null; phone: string | null; websiteUri: string | null; mapsUrl: string | null; reservable: boolean | null };

/** What to do to reserve here: whether Google says it takes reservations, the visit as asked for (with a warning if it is closed then), a request ready to copy, and the ways to reach it. Booking itself happens at the restaurant. */
function ReserveCard({ place, visit }: { place: Place; visit: Visit }) {
  const [table, setTable] = useState<{ id: string; value: Table | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const id = `${place.providerId}|${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    cachedGet(`/api/places/table?placeId=${encodeURIComponent(place.providerId)}`, { signal: controller.signal, ttlMs: attempt ? 0 : undefined })
      .then((r) => (r.ok ? (r.json() as Promise<{ place: Table }>) : Promise.reject(new Error("failed"))))
      .then((b) => setTable({ id, value: b.place }), () => { if (!controller.signal.aborted) setTable({ id, value: null }); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `id` stands for the place and the attempt
  }, [id]);
  const ready = table?.id === id;
  const info = ready ? table?.value : null;
  const phone = info?.phone ?? place.phone ?? null;
  const website = info?.websiteUri ?? place.websiteUri ?? null;
  const note = visitNote(place, visit);
  return (
    <section aria-label="Reserve a table" className="rounded-3xl bg-muted p-4">
      <h3 className="text-sm font-semibold">Reserve a table</h3>
      {!ready ? (
        <div className="mt-3 grid gap-2" aria-busy="true"><div className="skeleton h-11 rounded-full" /><div className="skeleton h-11 rounded-full" /></div>
      ) : (
        <>
          {info?.reservable !== null && info?.reservable !== undefined && <p className="mt-1 text-sm text-ink-soft">{info.reservable ? "Takes reservations. Book by phone or on its website." : "Doesn’t list reservations. Walking in is the usual way."}</p>}
          {!info && <p className="mt-1 text-sm text-ink-soft">We couldn’t check reservations. <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-medium underline underline-offset-2">Try again</button></p>}
          {visitSet(visit) && (
            <div className="mt-3 rounded-2xl bg-card px-4 py-3 text-sm">
              <p className="font-medium">{visitLine(visit)}</p>
              {note && <p className="mt-1 text-ink-soft">{note}</p>}
              <button
                type="button"
                onClick={() => { void navigator.clipboard?.writeText(requestText(place.name, visit)).then(() => setCopied(true), () => undefined); }}
                className="-mb-2 mt-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-full py-2 font-medium text-ink-soft underline underline-offset-2"
              >
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Copied. Paste it into a message" : "Copy a request to send"}
              </button>
            </div>
          )}
          <div className="mt-3 grid gap-2">
            {website && <a href={website} target="_blank" rel="noopener noreferrer" className={stateButton.primary + " inline-flex items-center justify-center gap-2"}><ExternalLink className="size-4" aria-hidden />Open website</a>}
            {phone && <a href={`tel:${phone}`} className={stateButton.secondary + " gap-2"}><Phone className="size-4" aria-hidden />Call {phone}</a>}
          </div>
        </>
      )}
    </section>
  );
}

/** One restaurant, in the same detail view a trip's Discover uses (photo, rating, hours, About, photos, reviews), with "Reserve a table" where "Add to trip" would be. */
function PlaceSheet({ place, visit, onClose }: { place: Place | null; visit: Visit; onClose: () => void }) {
  const [reserving, setReserving] = useState(false);
  useEffect(() => { setReserving(false); }, [place?.providerId]);
  return (
    <Sheet open={Boolean(place)} onClose={onClose} side="bottom" ariaLabel={place ? `${place.name}: details` : "Restaurant details"} className="icons-fine h-[92dvh] lg:max-w-lg">
      <SheetHeader title={place?.name ?? "Restaurant"} onClose={onClose} bordered={false} />
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {place && (
          <PlaceDetailView
            key={place.providerId}
            tripId={null}
            placeId={place.providerId}
            variant="panel"
            primaryAction={<button type="button" onClick={() => setReserving(true)} aria-expanded={reserving} className="btn-primary h-12 w-full rounded-full">Reserve a table</button>}
            extra={reserving ? <ReserveCard place={place} visit={visit} /> : visitSet(visit) ? <p className="text-sm text-ink-soft">{visitLine(visit)}</p> : null}
          />
        )}
      </div>
    </Sheet>
  );
}

/** One optional setting in the place sheet: shows what it is set to (or "Any ..."), opens the native picker on a tap, and has its own cross to clear it. */
function OptionalCell({ icon: Icon, label, value, empty, onClear, children }: { icon: typeof Clock; label: string; value: string; empty: string; onClear: () => void; children: ReactNode }) {
  return (
    <div className="relative rounded-2xl bg-muted px-4 py-3 transition-shadow focus-within:bg-card focus-within:ring-2 focus-within:ring-ink/80">
      <span className="flex items-center gap-1.5 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase"><Icon className="size-3.5" aria-hidden />{label}</span>
      <span className={"mt-1.5 block truncate font-display text-lg leading-6 font-medium tracking-[-0.02em] tabular-nums" + (value ? "" : " text-muted-foreground")}>{value || empty}</span>
      {children}
      {value && <button type="button" onClick={onClear} aria-label={`Clear ${label.toLowerCase()}`} className="absolute top-1.5 right-1.5 z-10 grid size-9 place-items-center rounded-full text-muted-foreground active:bg-card"><X className="size-4" aria-hidden /></button>}
    </div>
  );
}

/**
 * Eat for someone with no trip: pick a place, see what is good to eat there, and open a restaurant to reserve it. The same pills and photo tiles as a
 * trip's Eat page, with nothing saved to a trip.
 */
export function EatHome() {
  const [place, setPlace] = useState<string | null>(null);
  // Opens with the search sheet, as Stays does; closing it leaves the places around you (your home city, or your position when you allow it).
  const [choosing, setChoosing] = useState(true);
  const [home, setHome] = useState<string | null | undefined>(undefined);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationOff, setLocationOff] = useState(false);
  useEffect(() => {
    let live = true;
    cachedGet("/api/flights/home").then((r) => (r.ok ? r.json() : null)).then((b: { place: string | null } | null) => { if (live) setHome(b?.place ?? null); }, () => { if (live) setHome(null); });
    return () => { live = false; };
  }, []);
  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocationOff(true); return; }
    setLocating(true); setLocationOff(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => { setLocating(false); setLocationOff(true); },
      { timeout: 8000, maximumAge: 10 * 60_000 },
    );
  };
  const [typed, setTyped] = useState("");
  // A restaurant's name (or anything that is not a city or area) is searched as typed; a city or area is searched for places to eat.
  const [exact, setExact] = useState(false);
  // How many, which day, what time: all optional. Given a day or an hour, places closed then are left out (until the pill says otherwise).
  const [visit, setVisit] = useState<Visit>(NO_VISIT);
  const [openThen, setOpenThen] = useState(false);
  // Opening hours are asked for once a day or hour is given (they cost more to fetch, and a plain search never uses them).
  const [wantHours, setWantHours] = useState(false);
  const [typingPlace, setTypingPlace] = useState(false);
  const setPart = (patch: Partial<Visit>) => { const next = { ...visit, ...patch }; setVisit(next); setOpenThen(visitTimed(next)); if (visitTimed(next)) setWantHours(true); };
  const lastTypes = useRef<string[]>([]);
  const choose = (text: string, asTyped: boolean) => { setTyped(text); setPlace(text); setExact(asTyped); setChoosing(false); setSubs([]); };
  const keyboard = useKeyboardInset(choosing);
  const [subs, setSubs] = useState<string[]>([]);
  const toggleSub = (label: string) => setSubs((l) => (l.includes(label) ? l.filter((x) => x !== label) : [...l, label]));
  const [eat, setEat] = useState<EatView>(DEFAULT_EAT_VIEW);
  const [sheet, setSheet] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [found, setFound] = useState<{ key: string; places: Place[] | null }>({ key: "", places: null });
  const what = subs.length ? subs.map((l) => EAT.subs.find((s) => s.label === l)?.q ?? l).join(" or ") : EAT.q;
  // No place chosen: around the position when given, else around the home city; with neither there is nothing to look around.
  const idle = place === null;
  const around = idle && coords ? { lat: coords.lat, lng: coords.lng } : null;
  const query = !idle ? (exact ? place : `${what} in ${place}`) : around ? what : home ? `${what} in ${home}` : "";
  const key = query ? `${query}|${around ? `${around.lat.toFixed(3)},${around.lng.toFixed(3)}` : ""}|${wantHours}|${attempt}` : "";
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    cachedGet(`/api/places?query=${encodeURIComponent(query)}&limit=40${around ? `&lat=${around.lat}&lng=${around.lng}` : ""}${wantHours ? "&hours=1" : ""}`, { signal: controller.signal, ttlMs: attempt ? 0 : undefined })
      .then((r) => (r.ok ? (r.json() as Promise<{ places: Place[] }>) : Promise.reject(new Error("failed"))))
      .then((b) => setFound({ key, places: b.places ?? [] }), () => { if (!controller.signal.aborted) setFound({ key, places: null }); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the place, the type and the attempt
  }, [key]);

  const loading = (idle && home === undefined) || (Boolean(key) && found.key !== key);
  const places = useMemo(() => (found.key === key ? (found.places ?? []) : []), [found, key]);
  const rows = useMemo(() => places.filter((p) => !openThen || exact || openAt(p, visit) !== false).map((p) => ({ place: p })), [places, openThen, exact, visit]);
  const available = useMemo(() => availableEat(rows), [rows]);
  const shown = useMemo(() => applyEatView(rows, eat), [rows, eat]);
  const more = useShowMore(shown.length, shown, { first: 9, step: 9 });
  const visible = shown.slice(0, more.visible);
  const [open, setOpen] = useState<Place | null>(null);
  const cityLabel = place?.split(",")[0]?.trim() ?? "";
  const aroundLabel = coords ? "you" : home?.split(",")[0]?.trim() ?? "";
  const failed = !loading && Boolean(key) && found.places === null;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const clearAll = () => { setEat({ ...DEFAULT_EAT_VIEW, sort: eat.sort }); setSubs([]); setOpenThen(false); };

  const tile = (row: { place: Place }, mode: "feature" | "grid") => {
    const p = row.place;
    return (
      <DiscoverTile
        key={p.providerId}
        label={`Open ${p.name}`}
        onOpen={() => setOpen(p)}
        src={accountPhotoUrl(p.photoNames?.[0], 640)}
        icon={placeGlyph(p.category, p.name).icon}
        title={p.name}
        meta={[p.category ? categoryLabel(p.category) : null, isFoodPlace(p.category) ? priceLabel(p.priceLevel) : null].filter(Boolean).join(" · ") || undefined}
        rating={p.rating}
        feature={mode === "feature"}
      />
    );
  };

  const openLabel = visit.time ? `Open at ${fmtTime(visit.time)}` : visit.date ? "Open that date" : "";
  const openPills = visitTimed(visit) && !exact ? [{ key: "openThen", label: openLabel, on: openThen, onPress: () => setOpenThen((v) => !v) }] : [];
  // Before anything is searched the pill is the way in, worded and drawn as Flights' is; once a place is chosen it names it.
  const pill = (
    <button type="button" onClick={() => { setTyped(cityLabel); setChoosing(true); }} aria-haspopup="dialog" aria-label={cityLabel ? `Place: ${cityLabel}. Change` : "Where to? Search for a place or a restaurant"} className={"relative flex h-11 w-fit max-w-full items-center overflow-hidden rounded-full bg-muted px-5 text-center transition-transform active:scale-[0.985] gap-2.5" + (cityLabel ? "" : " min-w-[11rem]")}>
      {!cityLabel && <Search className="size-[1.125rem] shrink-0 text-ink-soft" aria-hidden />}
      <span className={"truncate font-display text-body font-semibold tracking-[-0.01em]" + (cityLabel ? "" : " text-ink-soft")}>{cityLabel || "Where to?"}</span>
    </button>
  );

  return (
    <main className="min-h-dvh bg-background px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
      <h1 className="sr-only">Eat</h1>
      <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-4 pb-12">
        <StandaloneHeader>{pill}</StandaloneHeader>
        {visitSet(visit) && (
          <button type="button" onClick={() => { setTyped(cityLabel); setChoosing(true); }} aria-haspopup="dialog" aria-label={`${visitLine(visit)}. Change`} className="-mt-1 inline-flex min-h-10 w-fit max-w-full items-center gap-2 rounded-full bg-muted px-4 text-sm font-medium transition-transform active:scale-[0.97]">
            <Users className="size-4 shrink-0 text-ink-soft" aria-hidden /><span className="truncate">{visitLine(visit)}</span>
          </button>
        )}
        {idle && aroundLabel && (
          <h2 className="font-display text-xl font-medium tracking-[-0.015em]">Around {aroundLabel}</h2>
        )}
        {idle && locationOff && <p role="status" className="-mt-2 text-sm text-ink-soft">Location is off for this site. {home ? `Showing places around ${aroundLabel}.` : "Choose a place instead."}</p>}
        <EatFilters extraPills={openPills} onClear={() => setOpenThen(false)} eat={eat} onChange={setEat} subs={subs} onToggleSub={toggleSub} onClearSubs={() => setSubs([])} available={available} shown={shown.length} showPills={Boolean(key) && (places.length > 0 || loading)} noType={exact} sheetOpen={sheet} onSheetOpen={setSheet} />
        <div aria-busy={loading}>
          {loading && visible.length === 0 ? (
            <SkeletonBand count={6} />
          ) : !key ? (
            <StateMessage icon={Utensils} title="Where do you want to eat?" actions={<><button type="button" onClick={useMyLocation} disabled={locating} className={stateButton.primary}>{locating ? "Finding you…" : "Use my location"}</button><button type="button" onClick={() => setChoosing(true)} className={stateButton.secondary}>Choose a place</button></>}>
              Allow your location for places around you, or pick a city or type a restaurant’s name.
            </StateMessage>
          ) : failed ? (
            <StateMessage icon={offline ? WifiOff : AlertCircle} title={offline ? "You’re offline" : "We couldn’t load places"} actions={<button type="button" onClick={() => setAttempt((n) => n + 1)} className={stateButton.primary}>Try again</button>}>
              {offline ? "Reconnect and the places will load." : "The problem is on our end, not with your search."}
            </StateMessage>
          ) : visible.length === 0 ? (
            places.length > 0 && rows.length === 0 && openThen ? (
              <StateMessage icon={Clock} title="Nothing open then" actions={<><button type="button" onClick={() => setOpenThen(false)} className={stateButton.primary}>Show places anyway</button><button type="button" onClick={() => { setTyped(cityLabel); setChoosing(true); }} className={stateButton.secondary}>Change the time</button></>}>
                Every place we found is closed {visit.time ? `at ${fmtTime(visit.time)}` : "that date"}{visit.date ? ` on ${visitLine({ ...NO_VISIT, date: visit.date })}` : ""}. Hours can differ on the day, so it is worth a call.
              </StateMessage>
            ) : places.length > 0 ? (
              <StateMessage icon={SearchX} title="No places match" actions={<button type="button" onClick={clearAll} className={stateButton.primary}>Clear filters</button>}>Loosen a filter to see more places.</StateMessage>
            ) : (
              <StateMessage icon={Utensils} title="No places to show" actions={<button type="button" onClick={() => setChoosing(true)} className={stateButton.primary}>Try another place</button>}>Nothing came back for {cityLabel || (aroundLabel ? `around ${aroundLabel}` : "this search")}. Try a different type or place.</StateMessage>
            )
          ) : (
            <div className="space-y-6">
              {tile(visible[0]!, "feature")}
              {visible.length > 1 && <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">{visible.slice(1).map((r) => tile(r, "grid"))}</div>}
            </div>
          )}
          {more.remaining > 0 && <ShowMoreButton next={more.next} visible={more.visible} total={shown.length} onClick={more.showMore} noun="places" />}
        </div>
      </div>

      <Sheet open={choosing} onClose={() => setChoosing(false)} side="top" ariaLabel="Eat" initialFocus={undefined} className="icons-fine lg:max-w-md">
        <SheetHeader title="Eat" onClose={() => setChoosing(false)} bordered={false} />
        <div className={"px-4 pb-5" + (keyboard ? " min-h-0 flex-1 overflow-y-auto overscroll-contain pb-0 pt-1" : "")}>
          <div onFocus={() => setTypingPlace(true)} onBlur={() => setTypingPlace(false)} className="flex items-center gap-3 rounded-2xl bg-muted px-4 py-3.5 transition-shadow focus-within:bg-card focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_5%,transparent),0_8px_18px_-12px_color-mix(in_oklab,var(--color-ink)_20%,transparent)]">
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">Place</span>
              <DestinationCombobox endpoint="/api/account/places/autocomplete" scope="places" full enter="free" onEnter={() => { if (typed.trim().length >= 2) choose(typed.trim(), false); }} value={typed} onChange={setTyped} onPick={(s) => { lastTypes.current = s.types ?? []; }} onSelect={(text) => choose(text, !lastTypes.current.some((t) => AREA_TYPES.includes(t)))} placeholder="A city, or a restaurant’s name" ariaLabel="Place to eat" quietFocus inputClassName="mt-1.5 block h-7 w-full truncate bg-transparent font-display text-xl leading-7 font-medium tracking-[-0.02em] outline-none placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground/70" />
            </div>
          </div>
          <FoldAway folded={keyboard && typingPlace}>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <OptionalCell icon={CalendarDays} label="Date" value={visit.date ? visitLine({ ...NO_VISIT, date: visit.date }) : ""} empty="Any date" onClear={() => setPart({ date: "" })}>
                <input type="date" aria-label="Date" value={visit.date} min={new Date().toLocaleDateString("en-CA")} onChange={(e) => setPart({ date: e.target.value })} className="absolute inset-0 size-full cursor-pointer opacity-0" />
              </OptionalCell>
              <OptionalCell icon={Clock} label="Time" value={visit.time ? fmtTime(visit.time) : ""} empty="Any time" onClear={() => setPart({ time: "" })}>
                <input type="time" aria-label="Time" value={visit.time} step={900} onChange={(e) => setPart({ time: e.target.value })} className="absolute inset-0 size-full cursor-pointer opacity-0" />
              </OptionalCell>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase"><Users className="size-3.5" aria-hidden />Guests</span>
              <span className="flex items-center gap-1" role="group" aria-label="Guests">
                <button type="button" aria-label="Fewer guests" disabled={visit.guests === null} onClick={() => setPart({ guests: visit.guests !== null && visit.guests > 1 ? visit.guests - 1 : null })} className="grid size-9 place-items-center rounded-full bg-card text-foreground transition-transform active:scale-[0.92] disabled:opacity-35"><Minus className="size-4" aria-hidden /></button>
                <span className="min-w-[4.5rem] text-center font-display text-lg font-medium tabular-nums" aria-live="polite">{visit.guests === null ? "Any" : visit.guests}</span>
                <button type="button" aria-label="More guests" disabled={visit.guests !== null && visit.guests >= MAX_GUESTS} onClick={() => setPart({ guests: visit.guests === null ? 1 : visit.guests + 1 })} className="grid size-9 place-items-center rounded-full bg-card text-foreground transition-transform active:scale-[0.92] disabled:opacity-35"><Plus className="size-4" aria-hidden /></button>
              </span>
            </div>
            {visit.guests !== null && visit.guests >= LARGE_GROUP && <p className="mt-2 text-sm text-ink-soft">For {visit.guests} or more, calling ahead works best.</p>}
          </FoldAway>
          <div className={"mt-4" + (keyboard ? " sticky bottom-0 -mx-4 rounded-b-4xl bg-background px-4 pb-3 pt-2" : "")}>
            <button
              type="button"
              disabled={!place && typed.trim().length < 2}
              onClick={() => { const text = typed.trim(); if (place && (text === cityLabel || text.length < 2)) setChoosing(false); else choose(text, false); }}
              className={searchButton}
            >
              Search places
            </button>
          </div>
        </div>
      </Sheet>
      <PlaceSheet place={open} visit={visit} onClose={() => setOpen(null)} />
    </main>
  );
}
