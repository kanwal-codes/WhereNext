"use client";

import { useEffect, useMemo, useState } from "react";
import { CityChips } from "@/components/CityChips";
import { useTripCity } from "@/lib/client/use-trip-city";
import { stayWindow } from "@/lib/trip-stops";
import { useTripStays } from "@/features/stays/application/useTripStays";
import { useRouter } from "next/navigation";
import { SwapView } from "@/components/SwapView";
import { StayResultCard } from "@/features/stays/ui/StayResultCard";
import { ChevronDown, Minus, Plus, SlidersHorizontal, Star } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { AiSearchBar } from "@/components/AiSearchBar";
import { readStayAsk, stayAskNeedsModel } from "@/lib/application/stay-ask";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { readStayDecision, type StayOption } from "@/packages/contracts/stay";
import { ActiveFilters, StayEmpty, StayError, StayProgress, StayResultSkeleton, StayStaleBanner, StayStatusLine } from "@/features/stays/ui/StayStatus";
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
import { SheetHeader } from "@/components/SheetHeader";
import { sheetPrimary } from "@/components/motion/sheetActions";
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

export function StaySurface({ tripId, destination }: { tripId: string; destination: string }) {
  const { data } = useTripData();
  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);
  const router = useRouter();
  const trip = data?.trip as { id?: string; destination?: string | null; start_date?: string | null; end_date?: string | null; travelers?: number | null; stops?: unknown } | undefined;
  // A multi-city trip is searched one city at a time, for the nights spent there; a one-city trip keeps its whole stay.
  const cities = useTripCity(trip);
  // Phone redesign: the city is the pill in the middle of the header, as on Discover.
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = narrow;
  const cityName = (cities.area?.name ?? (cities.hasChoice ? cities.city : destination)).split(",")[0].trim();
  const refine = useMemo(() => (cities.broad ? { tripId, parent: cities.parent, activeStop: cities.stop?.city ?? cities.parent, area: cities.area, onPickArea: cities.setArea } : undefined), [cities.broad, tripId, cities.parent, cities.stop, cities.area, cities.setArea]);
  const cityWindow = cities.hasChoice && cities.stop ? stayWindow(cities.stop) : null;
  const booked = useTripStays(tripId);

  const {
    checkin, setCheckin, checkout, setCheckout, adults, setAdults, rooms, setRooms, stars, setStars, boards, setBoards, propertyTypes, setPropertyTypes,
    refundable, setRefundable, priceMin, setPriceMin, priceMax, setPriceMax, sort, setSort, near, setNear, result, error, loading, slow, deepening, pricing, placeChanged, search, applyDirective, clearFilters,
  } = useStaySearch({
    tripId,
    start: { checkin: (cities.hasChoice ? cityWindow?.checkin : lockedStay?.checkin) ?? cityWindow?.checkin ?? trip?.start_date ?? "", checkout: (cities.hasChoice ? cityWindow?.checkout : lockedStay?.checkout) ?? cityWindow?.checkout ?? trip?.end_date ?? "" },
    travelers: trip?.travelers, city: cities.city, hasChoice: cities.scoped, cityWindow,
  });
  const [barOpen, setBarOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  // Typing another place in the sheet anchors the search there; the pill then names it.
  const pillCity = near.trim() ? near.split(",")[0]!.trim() : cityName;
  const keyboard = useKeyboardInset(barOpen);
  const [placeText, setPlaceText] = useState(pillCity);
  useEffect(() => { if (barOpen) setPlaceText(pillCity); }, [barOpen, pillCity]);
  const sheetedPill = useMediaQuery("(max-width: 639.98px)");
  const headerTitle = useMemo(() => {
    if (!phone || !pillCity) return undefined;
    // Under 640px the pill is the way into the search: it opens the dates and guests sheet (which holds the place choice too). A wider phone keeps the city sheet.
    if (sheetedPill) return <button type="button" onClick={() => setBarOpen(true)} aria-haspopup="dialog" aria-label={`Dates, guests and place: ${pillCity}. Change`} className="inline-flex h-11 max-w-full items-center gap-1.5 rounded-full bg-muted px-4 font-display text-body font-semibold tracking-[-0.01em] transition-transform active:scale-[0.97]"><span className="truncate">{pillCity}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden /></button>;
    return <CityPill stops={cities.stops} city={pillCity} onPick={cities.setCity} refine={refine} />;
  }, [phone, sheetedPill, pillCity, cities.stops, cities.setCity, refine]);
  useSetPhoneHeader({ titleNode: headerTitle });
  const nightsLabel = nightsText(nightsBetween(checkin, checkout));
  const [showFilters, setShowFilters] = useState(false);
  // On a phone the dates and the filters open as sheets over the page, so opening them moves nothing underneath; from `sm` up they stay inline.
  const sheeted = useMediaQuery("(max-width: 639.98px)");

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
    `/trips/${tripId}/stay/${encodeURIComponent(hotelId)}?checkin=${checkin || (result?.checkin ?? "")}&checkout=${checkout || (result?.checkout ?? "")}&adults=${adults}&rooms=${rooms}`;
  const panelCtx = useTripPanelMaybe();
  const stayEntry = (o: StayOption): CompareEntry => stayCompareEntry(o, detailHref(o.hotelId), money);
  const money = (n: number) => formatMoney(n, result?.currency ?? "CAD");
  const facets = result?.facets;
  const activeFilters = activeFilterCount({ stars, boards, propertyTypes, refundable, priceMin, priceMax });

  // A stay already booked for (some of) these nights: said up front, so nobody pays for the same nights twice.
  const alreadyBooked = overlappingStay(booked.items, checkin, checkout);

  const filterBody = (
    <div className="space-y-4">
      <div className="lg:hidden">
        <span className="text-sm font-semibold">Sort by</span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([["price", "Price, low to high"], ["price_desc", "Price, high to low"], ["rating", "Guest rating"], ["stars", "Stars"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setSort(key)} aria-pressed={sort === key} className="btn-chip justify-center">{label}</button>
          ))}
        </div>
      </div>
      {facets && facets.priceMax > facets.priceMin && (
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Price per night</span>
            <span className="text-muted-foreground tabular-nums">{priceMin ? `${money(priceMin)} to ${money(priceMax ?? facets.priceMax)}` : priceMax ? `Up to ${money(priceMax)}` : "Any price"}</span>
          </div>
          <input
            type="range"
            min={Math.floor(facets.priceMin)}
            max={Math.ceil(facets.priceMax)}
            value={priceMax ?? Math.ceil(facets.priceMax)}
            onChange={(e) => setPriceMax(Number(e.target.value) >= Math.ceil(facets.priceMax) ? null : Number(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
        </div>
      )}
      {facets && facets.propertyTypes.length > 1 && (
        <div>
          <span className="text-sm font-semibold">Type of place</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {facets.propertyTypes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPropertyTypes(toggled(propertyTypes, t))}
                aria-pressed={propertyTypes.includes(t)}
                className="btn-chip"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      {facets && facets.stars.length > 0 && (
        <div>
          <span className="text-sm font-semibold">Star rating</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {facets.stars.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStars(toggled(stars, s))}
                aria-pressed={stars.includes(s)}
                className="btn-chip"
              >
                {s} <Star className="size-3 fill-current" />
              </button>
            ))}
          </div>
        </div>
      )}
      {facets && facets.boards.length > 0 && (
        <div>
          <span className="text-sm font-semibold">Meals</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {facets.boards.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBoards(toggled(boards, b))}
                aria-pressed={boards.includes(b)}
                className="btn-chip"
              >
                {b}
              </button>
            ))}
          </div>
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
                <option value="price">Price, low to high</option>
                <option value="price_desc">Price, high to low</option>
                <option value="rating">Guest rating</option>
                <option value="stars">Stars</option>
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
          priceMin={priceMin} priceMax={priceMax} stars={stars} refundable={refundable} boards={boards} propertyTypes={propertyTypes} near={near} money={money}
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
        <StayProgress active={loading || deepening} />
        <StayStatusLine onOrder={sheeted ? () => setShowFilters(true) : undefined} loading={loading} slow={slow} deepening={deepening} error={error} hasResult={Boolean(result)} count={result?.options.length ?? 0} total={result?.total} filtered={activeFilters > 0} sort={sort} checkin={checkin} checkout={checkout} />
        </div>
      </div>

      {sheeted && (
        <>
          <Sheet open={barOpen} onClose={() => setBarOpen(false)} side="top" ariaLabel="Dates and guests" className="icons-fine max-h-[min(88dvh,var(--vvh,88dvh))]!">
            <SheetHeader title="Dates and guests" onClose={() => setBarOpen(false)} bordered={false} />
            <div className={cn("px-4 pb-5", keyboard && "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-0")}>
            {/* The place is typed here, the way the flights search takes it: another city anchors the search there. The chevron opens the trip's own cities and areas when there are some. */}
            <div className="mb-2 flex items-center gap-3 rounded-2xl bg-muted px-4 py-3.5 transition-shadow focus-within:bg-card focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_5%,transparent),0_8px_18px_-12px_color-mix(in_oklab,var(--color-ink)_20%,transparent)]">
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">Place</span>
                <DestinationCombobox tripId={tripId} value={placeText} onChange={setPlaceText} onSelect={(text) => { setPlaceText(text); setNear(text.trim() === cityName.trim() ? "" : text); }} placeholder="Where to?" ariaLabel="Place" quietFocus inputClassName="mt-1.5 block h-7 w-full truncate bg-transparent font-display text-xl leading-7 font-medium tracking-[-0.02em] outline-none placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground/70" />
              </div>
              {cities.stops.length > 1 || refine ? (
                <button type="button" onClick={() => { setBarOpen(false); setAreaOpen(true); }} aria-haspopup="dialog" aria-label="Choose from this trip" className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:bg-card"><ChevronDown className="size-5" aria-hidden /></button>
              ) : (
                <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">{cells}</div>
            <div className={cn("mt-4", keyboard && "sticky bottom-0 -mx-4 bg-background px-4 pb-3 pt-2")}>
              <button type="button" onClick={() => setBarOpen(false)} className={cn(sheetPrimary, "w-full flex-none")}>Done</button>
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
                  onPointerEnter={() => prefetchStayDetails(tripId, o.hotelId, { checkin: result?.checkin ?? checkin, checkout: result?.checkout ?? checkout })}
                  onFocusCapture={() => prefetchStayDetails(tripId, o.hotelId, { checkin: result?.checkin ?? checkin, checkout: result?.checkout ?? checkout })}
                >
                  <StayResultCard
                    phoneRow
                    nights={result.nights}
                    pricing={pricing}
                    stay={{ ...o, reviewCount: o.reviewCount, boardName: o.boardName }}
                    href={detailHref(o.hotelId)}
                    onOpen={() => {
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
      <AiSearchBar
        variant="dock"
        tripId={tripId}
        scope="stays"
        placeholder={phone ? "Try “Dec 10–14, 4 stars, under 200”" : `Ask — “near ${destination ? destination.split(",")[0] : "the old town"} station, under 250 a night, free cancellation”`}
        onDirective={applyDirective}
        readNow={(query) => readStayAsk(query, new Date().toLocaleDateString("en-CA"))}
        readWhole={(query) => !stayAskNeedsModel(query)}
      />
    </div>
  );
}
