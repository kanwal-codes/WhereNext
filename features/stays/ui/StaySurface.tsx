"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CityChips } from "@/components/CityChips";
import { useTripCity } from "@/lib/client/use-trip-city";
import { stayWindow } from "@/lib/trip-stops";
import { useTripStays } from "@/features/stays/application/useTripStays";
import { useRouter } from "next/navigation";
import { SwapView } from "@/components/SwapView";
import { StayResultCard } from "@/features/stays/ui/StayResultCard";
import { ChevronDown, Minus, Plus, SlidersHorizontal, Star, X } from "lucide-react";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { StandaloneHeader } from "@/components/StandaloneHeader";
import { StandaloneStaySheet } from "@/features/stays/ui/StandaloneStaySheet";
import { AiSearchBar } from "@/components/AiSearchBar";
import { readStayAsk, stayAskNeedsModel } from "@/lib/application/stay-ask";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { readStayDecision, type StayOption } from "@/packages/contracts/stay";
import { ActiveFilters, StayEmpty, StayError, StayResultSkeleton, StayStaleBanner, StayStatusLine } from "@/features/stays/ui/StayStatus";
import { formatMoney } from "@/lib/currency";
import { useShowMore } from "@/lib/use-show-more";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { cn } from "@/lib/utils";
import { AreaSheet } from "@/components/AreaSheet";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { CityPill } from "@/components/CityPill";
import { useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { useMediaQuery } from "@/lib/use-media-query";
import { Sheet } from "@/components/motion-primitives";
import { FoldAway } from "@/components/FoldAway";
import { SheetHeader } from "@/components/SheetHeader";
import { searchButton, sheetPrimary } from "@/components/motion/sheetActions";
import { fmtDay } from "@/lib/trip-dates";
import { prefetchStayDetails } from "@/features/stays/application/useStayDetails";
import { dateFormat } from "@/lib/format-cache";
import { useStaySearch } from "@/features/stays/application/useStaySearch";
import { activeFilterCount, nightsBetween, nightsText, overlappingStay, stayCompareEntry, toggled } from "@/features/stays/domain/stay-search";

/** "Tue, Oct 27", for the big date in a booking cell. */
const fmtLong = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : dateFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(d);
};

const cellLabel = "block text-2xs max-lg:text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase";

function Stepper({ label, value, set, min, max }: { label: string; value: number; set: (n: number) => void; min: number; max: number }) {
  const btn = "grid size-9 place-items-center rounded-full border border-border bg-background text-foreground max-lg:border-0 transition-[background-color,border-color,transform] hover:border-foreground/30 hover:bg-accent active:scale-[0.97] disabled:opacity-30 disabled:hover:bg-background";
  return (
    <div className="bg-card px-4 py-3.5 max-lg:rounded-2xl max-lg:bg-muted">
      <span className={cellLabel}>{label}</span>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => set(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`} className={btn}>
          <Minus className="size-3.5" />
        </button>
        <span className="min-w-6 text-center font-display text-2xl leading-none font-light tabular-nums tracking-[-0.03em]">{value}</span>
        <button type="button" onClick={() => set(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`} className={btn}>
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** A date cell: the date large in the display face, the label above it; the real date input sits invisibly over it, so a tap opens the native picker. */
function DateCell({ label, value, onChange, min }: { label: string; value: string; onChange: (v: string) => void; min?: string }) {
  return (
    <label className="relative block cursor-pointer bg-card px-4 py-3.5 transition-colors focus-within:bg-accent/50 hover:bg-accent/40 max-lg:rounded-2xl max-lg:bg-muted max-lg:focus-within:bg-card max-lg:focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_5%,transparent),0_8px_18px_-12px_color-mix(in_oklab,var(--color-ink)_20%,transparent)]">
      <span className={cellLabel}>{label}</span>
      <span className={cn("mt-2 block font-display text-xl leading-none font-medium tracking-[-0.02em] tabular-nums", !value && "text-muted-foreground")}>{value ? fmtLong(value) : "Add date"}</span>
      <input type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
    </label>
  );
}

/** Two days, two weeks out: what a search with no trip starts from (the dates are then the first thing to change). */
const isoIn = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

/** Stays, for a trip (its place, dates and bookings) or, with `tripId` null, for someone who only wants a hotel: the same page, searched from the person's own route. */
export function StaySurface({ tripId, destination }: { tripId: string | null; destination: string }) {
  const standalone = tripId === null;
  const data = useTripDataMaybe()?.data;
  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);
  const router = useRouter();
  const trip = data?.trip as { id?: string; destination?: string | null; start_date?: string | null; end_date?: string | null; travelers?: number | null; stops?: unknown } | undefined;
  // A multi-city trip is searched one city at a time, for the nights spent there; a one-city trip keeps its whole stay.
  const cities = useTripCity(trip);
  // Phone redesign: the city is the pill in the middle of the header, as on Discover.
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = narrow;
  const cityName = (cities.area?.name ?? (cities.hasChoice ? cities.city : destination)).split(",")[0].trim();
  const refine = useMemo(() => (cities.broad && tripId ? { tripId, parent: cities.parent, activeStop: cities.stop?.city ?? cities.parent, area: cities.area, onPickArea: cities.setArea } : undefined), [cities.broad, tripId, cities.parent, cities.stop, cities.area, cities.setArea]);
  const cityWindow = cities.hasChoice && cities.stop ? stayWindow(cities.stop) : null;
  const booked = useTripStays(tripId);
  const [openStay, setOpenStay] = useState<{ hotelId: string; name: string } | null>(null);

  const {
    checkin, setCheckin, checkout, setCheckout, adults, setAdults, rooms, setRooms, stars, setStars, boards, setBoards, propertyTypes, setPropertyTypes,
    refundable, setRefundable, priceMin, setPriceMin, priceMax, setPriceMax, sort, setSort, near, setNear, result, error, loading, slow, deepening, pricing, placeChanged, search, applyDirective, clearFilters,
  } = useStaySearch({
    tripId,
    start: standalone ? { checkin: isoIn(14), checkout: isoIn(16) } : { checkin: (cities.hasChoice ? cityWindow?.checkin : lockedStay?.checkin) ?? cityWindow?.checkin ?? trip?.start_date ?? "", checkout: (cities.hasChoice ? cityWindow?.checkout : lockedStay?.checkout) ?? cityWindow?.checkout ?? trip?.end_date ?? "" },
    travelers: trip?.travelers, city: standalone ? destination : cities.city, hasChoice: standalone || cities.scoped, cityWindow,
  });
  const [barOpen, setBarOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  // Typing another place in the sheet anchors the search there; the pill then names it.
  const pillCity = near.trim() ? near.split(",")[0]!.trim() : cityName;
  const keyboard = useKeyboardInset(barOpen);
  // With no trip the search starts empty when no home place is known: the sheet that takes the place opens at once.
  useEffect(() => { if (standalone && !destination.trim()) setBarOpen(true); }, [standalone, destination]);
  const [typing, setTyping] = useState(false);
  const [placeText, setPlaceText] = useState(pillCity);
  useEffect(() => { if (barOpen) setPlaceText(pillCity); }, [barOpen, pillCity]);
  const sheetedPill = useMediaQuery("(max-width: 639.98px)") || standalone;
  const pillNode = useMemo(() => {
    if (!phone && !standalone) return undefined;
    if (!pillCity && !standalone) return undefined;
    // Under 640px the pill is the way into the search: it opens the dates and guests sheet (which holds the place choice too). A wider phone keeps the city sheet.
    if (sheetedPill) return <button type="button" onClick={() => setBarOpen(true)} aria-haspopup="dialog" aria-label={pillCity ? `Dates, guests and place: ${pillCity}. Change` : "Choose a place"} className="inline-flex h-11 max-w-full items-center gap-1.5 rounded-full bg-muted px-4 font-display text-body font-semibold tracking-[-0.01em] transition-transform active:scale-[0.97]"><span className="truncate">{pillCity || "Where to?"}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden /></button>;
    return <CityPill stops={cities.stops} city={pillCity} onPick={cities.setCity} refine={refine} />;
  }, [phone, standalone, sheetedPill, pillCity, cities.stops, cities.setCity, refine]);
  useSetPhoneHeader({ titleNode: standalone ? undefined : pillNode });
  const nightsLabel = nightsText(nightsBetween(checkin, checkout));
  const [showFilters, setShowFilters] = useState(false);
  // On a phone the dates and the filters open as sheets over the page, so opening them moves nothing underneath; from `sm` up they stay inline.
  const sheeted = useMediaQuery("(max-width: 639.98px)") || standalone;

  const { visible, remaining, next, showMore, first } = useShowMore(result?.options.length ?? 0, result);
  // The list on screen is for another place (the area or city changed): none of it is worth keeping while the new one loads.
  const showList = Boolean(result && result.options.length > 0) && !placeChanged;
  // One view at a time: the skeleton until there is something to say (or while the last list is being replaced by nothing yet), then the list, why there is none, or why it failed.
  const view = showList ? "results" : loading || deepening || (!result && !error) ? "skeleton" : result ? "empty" : "error";
  const openDates = () => {
    if (sheeted) return setBarOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelector<HTMLInputElement>('main input[type="date"]')?.focus();
  };

  const detailHref = (hotelId: string) =>
    standalone ? "#" : `/trips/${tripId}/stay/${encodeURIComponent(hotelId)}?checkin=${checkin || (result?.checkin ?? "")}&checkout=${checkout || (result?.checkout ?? "")}&adults=${adults}&rooms=${rooms}`;
  const panelCtx = useTripPanelMaybe();
  const stayEntry = (o: StayOption): CompareEntry => stayCompareEntry(o, detailHref(o.hotelId), money);
  const money = (n: number) => formatMoney(n, result?.currency ?? "CAD");
  const facets = result?.facets;
  const activeFilters = activeFilterCount({ stars, boards, propertyTypes, refundable, priceMin, priceMax });

  // A stay already booked for (some of) these nights: said up front, so nobody pays for the same nights twice.
  const alreadyBooked = overlappingStay(booked.items, checkin, checkout);

  // The controls of each group, without their titles: the sheet and the desktop bar put a title over them, a pill's small panel has its own.
  const priceLabel = priceMin ? `${money(priceMin)} to ${money(priceMax ?? facets?.priceMax ?? 0)}` : priceMax ? `Up to ${money(priceMax)}` : "Any price";
  const sortContent = (
    <div className="grid grid-cols-2 gap-2">
      {([["price", "Lowest price"], ["price_desc", "Highest price"], ["rating", "Best rated"], ["stars", "Most stars"]] as const).map(([key, label]) => (
        <button key={key} type="button" onClick={() => { setSort(key); setOpenPill(null); }} aria-pressed={sort === key} className="btn-chip justify-center">{label}</button>
      ))}
    </div>
  );
  const priceContent = facets && facets.priceMax > facets.priceMin ? (
    <input
      type="range"
      aria-label="Highest price per night"
      min={Math.floor(facets.priceMin)}
      max={Math.ceil(facets.priceMax)}
      value={priceMax ?? Math.ceil(facets.priceMax)}
      onChange={(e) => setPriceMax(Number(e.target.value) >= Math.ceil(facets.priceMax) ? null : Number(e.target.value))}
      className="w-full accent-primary"
    />
  ) : null;
  const typeContent = facets && facets.propertyTypes.length > 1 ? (
    <div className="flex flex-wrap gap-2">
      {facets.propertyTypes.map((t) => (
        <button key={t} type="button" onClick={() => setPropertyTypes(toggled(propertyTypes, t))} aria-pressed={propertyTypes.includes(t)} className="btn-chip">{t}</button>
      ))}
    </div>
  ) : null;
  const starsContent = facets && facets.stars.length > 0 ? (
    <div className="flex flex-wrap gap-2">
      {facets.stars.map((st) => (
        <button key={st} type="button" onClick={() => setStars(toggled(stars, st))} aria-pressed={stars.includes(st)} className="btn-chip">{st} <Star className="size-3 fill-current" /></button>
      ))}
    </div>
  ) : null;
  const mealsContent = facets && facets.boards.length > 0 ? (
    <div className="flex flex-wrap gap-2">
      {facets.boards.map((bd) => (
        <button key={bd} type="button" onClick={() => setBoards(toggled(boards, bd))} aria-pressed={boards.includes(bd)} className="btn-chip">{bd}</button>
      ))}
    </div>
  ) : null;

  const filterBody = (
    <div className="space-y-4">
      <div className="lg:hidden">
        <span className="text-sm font-semibold">Sort by</span>
        <div className="mt-2">{sortContent}</div>
      </div>
      {priceContent && (
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Price per night</span>
            <span className="text-muted-foreground tabular-nums">{priceLabel}</span>
          </div>
          <div className="mt-2">{priceContent}</div>
        </div>
      )}
      {typeContent && (
        <div>
          <span className="text-sm font-semibold">Type of place</span>
          <div className="mt-2">{typeContent}</div>
        </div>
      )}
      {starsContent && (
        <div>
          <span className="text-sm font-semibold">Star rating</span>
          <div className="mt-2">{starsContent}</div>
        </div>
      )}
      {mealsContent && (
        <div>
          <span className="text-sm font-semibold">Meals</span>
          <div className="mt-2">{mealsContent}</div>
        </div>
      )}
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl bg-muted px-4 text-body max-sm:flex sm:min-h-0 sm:rounded-none sm:bg-transparent sm:px-0 sm:text-sm">
        <input type="checkbox" checked={refundable} onChange={(e) => setRefundable(e.target.checked)} className="size-5 accent-primary sm:size-4" />
        Free cancellation only
      </label>
      {activeFilters > 0 && (
        <button type="button" onClick={clearFilters} className="text-xs font-medium text-primary hover:underline max-sm:hidden">
          Clear filters
        </button>
      )}
    </div>
  );

  // A phone: a row of pills under the header (no count line), each showing what it is set to and opening its group in a small panel over the list.
  type PillKey = "sort" | "price" | "type" | "stars" | "meals";
  const [openPill, setOpenPill] = useState<PillKey | null>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openPill) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenPill(null); };
    const away = (e: PointerEvent) => { if (!pillsRef.current?.contains(e.target as Node)) setOpenPill(null); };
    document.addEventListener("keydown", esc);
    document.addEventListener("pointerdown", away);
    return () => { document.removeEventListener("keydown", esc); document.removeEventListener("pointerdown", away); };
  }, [openPill]);
  const SORT_LABEL = { price: "Lowest price", price_desc: "Highest price", rating: "Best rated", stars: "Most stars" } as const;
  const pillDefs: Array<{ key: PillKey; label: string; on: boolean; title: string; body: ReactNode; clear?: () => void }> = [
    { key: "sort", label: `Sort: ${SORT_LABEL[sort]}`, on: sort !== "price", title: "Sort by", body: sortContent },
    ...(priceContent ? [{ key: "price" as const, label: priceMin || priceMax ? priceLabel : "Price", on: Boolean(priceMin || priceMax), title: "Price per night", body: <div><p className="mb-1 text-sm text-muted-foreground tabular-nums">{priceLabel}</p>{priceContent}</div>, clear: () => { setPriceMin(null); setPriceMax(null); } }] : []),
    ...(typeContent ? [{ key: "type" as const, label: propertyTypes.length === 1 ? propertyTypes[0]! : propertyTypes.length > 1 ? `${propertyTypes.length} types` : "Type", on: propertyTypes.length > 0, title: "Type of place", body: typeContent, clear: () => setPropertyTypes([]) }] : []),
    ...(starsContent ? [{ key: "stars" as const, label: stars.length ? `${[...stars].sort((x, y) => y - x).join(", ")} stars` : "Stars", on: stars.length > 0, title: "Star rating", body: starsContent, clear: () => setStars([]) }] : []),
    ...(mealsContent ? [{ key: "meals" as const, label: boards.length === 1 ? boards[0]! : boards.length > 1 ? `${boards.length} meal plans` : "Meals", on: boards.length > 0, title: "Meals", body: mealsContent, clear: () => setBoards([]) }] : []),
  ];
  const showPills = sheeted && Boolean(result) && !error && (result?.options.length ?? 0) > 0 && !loading && !deepening;
  const openDef = pillDefs.find((d) => d.key === openPill) ?? null;

  const cells = (
    <>
      <DateCell label="Check-in" value={checkin} onChange={setCheckin} />
      <DateCell label="Check-out" value={checkout} onChange={setCheckout} min={checkin || undefined} />
      <Stepper label="Guests" value={adults} set={setAdults} min={1} max={16} />
      <Stepper label="Rooms" value={rooms} set={setRooms} min={1} max={8} />
    </>
  );


  return (
    <div className="flex min-h-[calc(100svh-13rem)] flex-col gap-5">
      {standalone && <StandaloneHeader>{pillNode}</StandaloneHeader>}
      <CityChips stops={cities.stops} current={cities.stop?.city ?? cities.city} onPick={cities.setCity} estimated={cities.estimated} refine={refine} className="-mb-2 max-lg:hidden" />
      {alreadyBooked && (
        <p role="status" className="rounded-2xl bg-muted px-4 py-3 text-sm">
          You already have <span className="font-medium">{alreadyBooked.title}</span> booked<span className="max-lg:hidden">{alreadyBooked.date ? ` (${fmtDay(alreadyBooked.date)}${alreadyBooked.endDate ? ` → ${fmtDay(alreadyBooked.endDate)}` : ""})` : ""}</span> for some of these nights.{" "}
          <a href={`/trips/${tripId}/bookings`} className="-my-3 inline-block py-3 underline underline-offset-2">See your bookings</a>
        </p>
      )}
      {/* The booking bar: four cells divided by hairlines (the gap shows the border colour through), then filters and sort. */}
      <div className="overflow-hidden rounded-4xl bg-card shadow-float ring-1 ring-black/[0.05] max-lg:overflow-visible max-lg:rounded-none max-lg:bg-transparent max-lg:shadow-none max-lg:ring-0">
        {!sheeted && (
          <div className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 max-lg:mb-3 max-lg:gap-2 max-lg:overflow-visible max-lg:border-0 max-lg:bg-transparent">{cells}</div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-card px-4 py-3 max-lg:-mx-4 sm:max-lg:-mx-8 max-lg:flex-nowrap max-lg:gap-2 max-lg:overflow-x-auto max-lg:border-t-0 max-lg:bg-transparent max-lg:px-4 sm:max-lg:px-8 max-lg:py-0 max-lg:[-ms-overflow-style:none] max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden max-sm:hidden">
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-pressed={showFilters} className="btn-chip shrink-0 max-lg:h-10 max-lg:text-sm">
            <SlidersHorizontal className="size-3.5" aria-hidden /> Filters{activeFilters ? ` · ${activeFilters}` : ""}
          </button>
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground max-lg:hidden">
            Sort
            <span className="relative">
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-8 max-lg:h-10 max-lg:text-sm cursor-pointer appearance-none rounded-full border border-border bg-background pr-8 pl-3.5 text-xs font-medium text-ink-soft transition-colors hover:border-ink/30 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <option value="price">Lowest price</option>
                <option value="price_desc">Highest price</option>
                <option value="rating">Best rated</option>
                <option value="stars">Most stars</option>
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </span>
          </label>
          <button type="button" onClick={() => setRefundable((v) => !v)} aria-pressed={refundable} className="btn-chip shrink-0 max-lg:h-10 max-lg:text-sm lg:hidden">
            Free cancellation
          </button>
        </div>

        {showFilters && !sheeted && (
          <div className="border-t border-border px-4 py-4 max-lg:mt-3 max-lg:rounded-2xl max-lg:border max-lg:bg-card">{filterBody}</div>
        )}
      </div>

      <div className="-mt-2 space-y-3">
        <ActiveFilters
          priceMin={priceMin} priceMax={priceMax} stars={stars} refundable={refundable} boards={boards} propertyTypes={propertyTypes} near={standalone ? "" : near} money={money}
          on={{
            price: () => { setPriceMin(null); setPriceMax(null); },
            stars: () => setStars([]),
            refundable: () => setRefundable(false),
            board: (b) => setBoards(toggled(boards, b)),
            type: (t) => setPropertyTypes(toggled(propertyTypes, t)),
            near: () => setNear(""),
            all: () => { clearFilters(); setNear(""); },
          }}
        />
        <div className="relative">
        {!showPills && <StayStatusLine loading={loading} slow={slow} deepening={deepening} error={error} hasResult={Boolean(result)} count={result?.options.length ?? 0} total={result?.total} filtered={activeFilters > 0} sort={sort} checkin={checkin} checkout={checkout} />}
        {showPills && (
          <div ref={pillsRef} className="relative">
            <div role="group" aria-label="Sort and filter" className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4">
              <button type="button" onClick={() => setShowFilters(true)} aria-haspopup="dialog" aria-pressed={activeFilters > 0} className="btn-chip shrink-0 gap-1.5">
                <SlidersHorizontal className="size-3.5" aria-hidden />
                {activeFilters > 0 ? `Filters · ${activeFilters}` : "Filters"}
              </button>
              {pillDefs.map((d) => (
                <button key={d.key} type="button" onClick={() => setOpenPill((cur) => (cur === d.key ? null : d.key))} aria-expanded={openPill === d.key} aria-pressed={d.on} className="btn-chip shrink-0 gap-1.5">
                  {d.label}
                  <ChevronDown className={cn("size-3.5 opacity-60 transition-transform duration-200", openPill === d.key && "rotate-180")} aria-hidden />
                </button>
              ))}
              <button type="button" onClick={() => setRefundable(!refundable)} aria-pressed={refundable} className="btn-chip shrink-0">Free cancellation</button>
            </div>
            {openDef && (
              <div role="region" aria-label={openDef.title} className="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl bg-card p-4 shadow-lift ring-1 ring-border">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{openDef.title}</h3>
                  <div className="-mr-2 flex items-center gap-1">
                    {openDef.on && openDef.clear && <button type="button" onClick={openDef.clear} className="rounded-full px-2.5 py-1.5 text-sm font-medium text-ink-soft underline underline-offset-2 active:bg-muted">Clear</button>}
                    <button type="button" onClick={() => setOpenPill(null)} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted"><X className="size-4" aria-hidden /></button>
                  </div>
                </div>
                <div className="mt-3">{openDef.body}</div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {sheeted && (
        <>
          <Sheet open={barOpen} onClose={() => setBarOpen(false)} side="top" ariaLabel="Stays" className={cn("icons-fine max-h-[min(88dvh,var(--vvh,88dvh))]!", keyboard && typing && "min-h-[min(88dvh,var(--vvh,88dvh))]")}>
            <SheetHeader title="Stays" onClose={() => setBarOpen(false)} bordered={false} />
            <div className={cn("px-4 pb-5", keyboard && "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-0 pt-1")}>
            {/* The place is typed here, the way the flights search takes it: another city anchors the search there. The chevron opens the trip's own cities and areas when there are some. */}
            <div onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} className="mb-2 flex items-center gap-3 rounded-2xl bg-muted px-4 py-3.5 transition-shadow focus-within:bg-card focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_5%,transparent),0_8px_18px_-12px_color-mix(in_oklab,var(--color-ink)_20%,transparent)]">
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">Place</span>
                <DestinationCombobox tripId={tripId ?? undefined} endpoint={standalone ? "/api/account/places/autocomplete" : undefined} value={placeText} onChange={setPlaceText} onSelect={(text) => { setPlaceText(text); setNear(text.trim() === cityName.trim() ? "" : text); }} placeholder="Where to?" ariaLabel="Place" quietFocus inputClassName="mt-1.5 block h-7 w-full truncate bg-transparent font-display text-xl leading-7 font-medium tracking-[-0.02em] outline-none placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground/70" />
              </div>
              {cities.stops.length > 1 || refine ? (
                <button type="button" onClick={() => { setBarOpen(false); setAreaOpen(true); }} aria-haspopup="dialog" aria-label="Choose from this trip" className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:bg-card"><ChevronDown className="size-5" aria-hidden /></button>
              ) : (
                <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
            </div>
            <FoldAway folded={keyboard && typing}><div className="grid grid-cols-2 gap-2">{cells}</div></FoldAway>
            <div className={cn("mt-4", keyboard && "sticky bottom-0 -mx-4 rounded-b-4xl bg-background px-4 pb-3 pt-2")}>
              <button type="button" onClick={() => setBarOpen(false)} disabled={standalone && !placeText.trim()} className={searchButton}>Search stays</button>
            </div>
            </div>
          </Sheet>
          <AreaSheet open={areaOpen} onClose={() => setAreaOpen(false)} tripId={refine?.tripId ?? ""} parent={refine?.parent ?? pillCity} stops={cities.stops} activeStop={refine?.activeStop ?? pillCity} area={refine?.area ?? null} onPickStop={cities.setCity} onPickArea={refine?.onPickArea ?? (() => {})} narrow={Boolean(refine)} />
          <Sheet open={showFilters} onClose={() => setShowFilters(false)} ariaLabel="Sort and filter" padded footer={<button type="button" onClick={() => setShowFilters(false)} className={sheetPrimary}>Done</button>}>
            <div className="flex items-baseline justify-between gap-3 pb-3 pt-1">
              <p className="font-display text-xl font-medium tracking-[-0.02em]">Sort and filter</p>
              {activeFilters > 0 && <button type="button" onClick={clearFilters} className="-my-2 -mr-2 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft underline underline-offset-2 active:bg-muted">Clear all</button>}
            </div>
            <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain -mx-1 px-1">{filterBody}</div>
          </Sheet>
        </>
      )}

      <div className="relative" aria-busy={loading || deepening}>
        <SwapView id={view}>
      {view === "skeleton" ? (
        <StayResultSkeleton count={6} />
      ) : showList && result ? (
        <>
          {error && <StayStaleBanner onRetry={() => void search(true)} />}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 max-lg:gap-x-5 max-lg:gap-y-7">
            {result.options.slice(0, visible).map((o, index) => {
              const comparing = Boolean(panelCtx?.compareMode);
              return (
                <li
                  key={o.hotelId}
                  className={cn("min-w-0", index >= first && "settle-in")}
                  onPointerEnter={() => tripId && prefetchStayDetails(tripId, o.hotelId, { checkin: result?.checkin ?? checkin, checkout: result?.checkout ?? checkout })}
                  onFocusCapture={() => tripId && prefetchStayDetails(tripId, o.hotelId, { checkin: result?.checkin ?? checkin, checkout: result?.checkout ?? checkout })}
                >
                  <StayResultCard
                    phoneRow
                    nights={result.nights}
                    pricing={pricing}
                    stay={{ ...o, reviewCount: o.reviewCount, boardName: o.boardName }}
                    href={detailHref(o.hotelId)}
                    onOpen={() => {
                      if (standalone) return setOpenStay({ hotelId: o.hotelId, name: o.name });
                      if (!panelCtx) return router.push(detailHref(o.hotelId));
                      if (panelCtx.compareMode) return panelCtx.compareToggle(stayEntry(o));
                      panelCtx.openPanel({ kind: "stay", hotelId: o.hotelId, name: o.name, checkin: result?.checkin ?? checkin, checkout: result?.checkout ?? checkout });
                    }}
                    locked={lockedStay?.hotelId === o.hotelId}
                    comparing={comparing}
                    selected={comparing && Boolean(panelCtx?.compareHas(o.hotelId))}
                  />
                </li>
              );
            })}
          </ul>
          <ShowMoreButton next={next} visible={visible} total={visible + remaining} onClick={showMore} />
        </>
      ) : view === "empty" ? (
        <StayEmpty filtered={activeFilters > 0} priced={Boolean(priceMin || priceMax)} near={near} total={result?.total ?? 0} checkin={checkin} checkout={checkout} onClear={clearFilters} onClearPrice={() => { setPriceMin(null); setPriceMax(null); }} onWiden={() => setNear("")} onDates={openDates} />
      ) : (
        error && <StayError error={error} onRetry={() => void search(true)} />
      )}
        </SwapView>
      </div>

      {/* Last in the column so it can rest on the bottom edge of the page (see `.ask-dock`). */}
      {standalone && <StandaloneStaySheet pick={openStay ? { ...openStay, checkin: result?.checkin ?? checkin, checkout: result?.checkout ?? checkout, adults, rooms, location: pillCity } : null} onClose={() => setOpenStay(null)} />}
      {tripId && (
        <AiSearchBar
          variant="dock"
          tripId={tripId}
          scope="stays"
          placeholder={phone ? "Try “Dec 10–14, 4 stars, under 200”" : `Ask — “near ${destination ? destination.split(",")[0] : "the old town"} station, under 250 a night, free cancellation”`}
          onDirective={applyDirective}
          readNow={(query) => readStayAsk(query, new Date().toLocaleDateString("en-CA"))}
          readWhole={(query) => !stayAskNeedsModel(query)}
        />
      )}
    </div>
  );
}
