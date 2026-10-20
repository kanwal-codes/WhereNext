"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { CityChips } from "@/components/CityChips";
import { useTripCity } from "@/lib/client/use-trip-city";
import { stayWindow } from "@/lib/trip-stops";
import { useTripStays } from "@/features/stays/application/useTripStays";
import { useRouter } from "next/navigation";
import { SwapView } from "@/components/SwapView";
import { StayResultCard } from "@/features/stays/ui/StayResultCard";
import { BedDouble, ChevronDown, Loader2, MapPin, Minus, Plus, SlidersHorizontal, Star, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { AiSearchBar } from "@/components/AiSearchBar";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { readStayDecision, type StayFacets, type StayOption } from "@/packages/contracts/stay";
import { SkeletonList } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { formatMoney } from "@/lib/currency";
import { useShowMore } from "@/lib/use-show-more";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { cn } from "@/lib/utils";
import { PHONE_V2 } from "@/lib/phone-v2";
import { CityPill } from "@/components/CityPill";
import { useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { useMediaQuery } from "@/lib/use-media-query";
import { fmtDay } from "@/lib/trip-dates";
import { cachedGet } from "@/lib/client/cached-get";
import { prefetchStayDetails } from "@/features/stays/application/useStayDetails";

type Result = {
  location: string;
  checkin: string;
  checkout: string;
  assumedDates: boolean;
  nights: number;
  adults: number;
  rooms: number;
  currency: string;
  options: StayOption[];
  facets: StayFacets;
};

/** "Tue, Oct 27", for the big date in a booking cell. */
const fmtLong = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(d);
};

const cellLabel = "block text-[0.625rem] max-lg:text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase";

function Stepper({ label, value, set, min, max }: { label: string; value: number; set: (n: number) => void; min: number; max: number }) {
  const btn = "grid size-9 place-items-center rounded-full border border-border bg-background text-foreground max-lg:border-0 transition-[background-color,border-color,transform] hover:border-foreground/30 hover:bg-accent active:scale-95 disabled:opacity-30 disabled:hover:bg-background";
  return (
    <div className={cn("bg-card px-4 py-3.5", PHONE_V2 && "max-lg:rounded-2xl max-lg:bg-secondary")}>
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
    <label className={cn("relative block cursor-pointer bg-card px-4 py-3.5 transition-colors focus-within:bg-accent/50 hover:bg-accent/40", PHONE_V2 && "max-lg:rounded-2xl max-lg:bg-secondary max-lg:focus-within:bg-card max-lg:focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_5%,transparent),0_10px_24px_-14px_color-mix(in_oklab,var(--color-ink)_30%,transparent)]")}>
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
  const phone = PHONE_V2 && narrow;
  const pillCity = (cities.hasChoice ? cities.city : destination).split(",")[0].trim();
  const headerTitle = useMemo(() => (phone && pillCity ? <CityPill stops={cities.stops} city={pillCity} onPick={cities.setCity} /> : undefined), [phone, pillCity, cities.stops, cities.setCity]);
  useSetPhoneHeader({ titleNode: headerTitle });
  const cityWindow = cities.hasChoice && cities.stop ? stayWindow(cities.stop) : null;
  const booked = useTripStays(tripId);

  const [checkin, setCheckin] = useState((cities.hasChoice ? cityWindow?.checkin : lockedStay?.checkin) ?? cityWindow?.checkin ?? trip?.start_date ?? "");
  const [checkout, setCheckout] = useState((cities.hasChoice ? cityWindow?.checkout : lockedStay?.checkout) ?? cityWindow?.checkout ?? trip?.end_date ?? "");
  const [adults, setAdults] = useState(Math.max(1, Math.min(trip?.travelers ?? 2, 24)));
  const [rooms, setRooms] = useState(1);
  const [barOpen, setBarOpen] = useState(false);
  const nightsCount = checkin && checkout ? Math.round((Date.parse(`${checkout}T00:00:00`) - Date.parse(`${checkin}T00:00:00`)) / 864e5) : 0;
  const nightsLabel = nightsCount > 0 ? `${nightsCount} night${nightsCount === 1 ? "" : "s"}` : "";
  const [stars, setStars] = useState<number[]>([]);
  const [boards, setBoards] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [refundable, setRefundable] = useState(false);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [sort, setSort] = useState<"price" | "rating" | "stars">("price");
  const [showFilters, setShowFilters] = useState(false);
  const [near, setNear] = useState(""); // AI "hotels near X" — overrides the destination anchor

  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Picking another city moves the search to that city and the nights spent there.
  const lastCity = useRef(cities.city);
  useEffect(() => {
    if (!cities.hasChoice || lastCity.current === cities.city) return;
    lastCity.current = cities.city;
    setNear("");
    if (cityWindow) {
      setCheckin(cityWindow.checkin);
      setCheckout(cityWindow.checkout);
    }
  }, [cities.city, cities.hasChoice, cityWindow]);

  const search = useCallback(async () => {
    const mine = ++reqId.current;
    // Cancel a still-in-flight prior search instead of just ignoring its response — otherwise
    // rapid filter changes (stars, boards, dates) kept every earlier request running against the
    // hotel provider for nothing, same fix DiscoverySurface already has for its own searches.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setStatus("");
    try {
      const qs = new URLSearchParams({ adults: String(adults), rooms: String(rooms), sort });
      if (near.trim()) qs.set("location", near.trim());
      else if (cities.hasChoice && cities.city) qs.set("location", cities.city);
      if (checkin) qs.set("checkin", checkin);
      if (checkout) qs.set("checkout", checkout);
      if (stars.length) qs.set("stars", stars.join(","));
      if (boards.length) qs.set("boards", boards.join(","));
      if (propertyTypes.length) qs.set("propertyTypes", propertyTypes.join(","));
      if (refundable) qs.set("refundable", "1");
      if (priceMax) qs.set("priceMax", String(priceMax));
      const cacheKey = `stay-search:${tripId}:${qs.toString()}`;
      const cachedResult = readSessionCache<Result>(cacheKey, 5 * 60_000);
      if (cachedResult) {
        if (mine !== reqId.current) return;
        setResult(cachedResult);
        setStatus(cachedResult.options.length === 0 ? "Nothing matched — loosen the filters or change the dates." : "");
        return;
      }

      const response = await cachedGet(`/api/trips/${tripId}/stays?${qs}`, { signal: controller.signal });
      const body = await response.json();
      if (mine !== reqId.current) return;
      if (!response.ok) {
        setResult(null);
        setStatus("We couldn't load hotels just now. Try again in a moment.");
        return;
      }
      const next = body as Result;
      writeSessionCache(cacheKey, next);
      setResult(next);
      setStatus((next.options ?? []).length === 0 ? "Nothing matched — loosen the filters or change the dates." : "");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (mine === reqId.current) {
        setResult(null);
        setStatus("We couldn't load hotels just now. Try again in a moment.");
      }
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [tripId, adults, rooms, sort, checkin, checkout, stars, boards, propertyTypes, refundable, priceMax, near, cities.hasChoice, cities.city]);

  useEffect(() => {
    void search();
  }, [search]);

  const { visible, remaining, next, showMore, first } = useShowMore(result?.options.length ?? 0, result);

  function applyDirective(d: import("@/lib/application/ai-search").AiSearchDirective) {
    if (d.location !== undefined) setNear(d.location);
    if (d.priceMax !== undefined) setPriceMax(d.priceMax);
    if (d.stars?.length) setStars(d.stars);
    if (d.boards?.length) setBoards(d.boards);
    if (d.propertyTypes?.length) setPropertyTypes(d.propertyTypes);
    if (d.refundable !== undefined) setRefundable(d.refundable);
    if (d.sort) setSort(d.sort);
    if (d.adults) setAdults(Math.max(1, Math.min(d.adults, 16)));
    if (d.rooms) setRooms(Math.max(1, Math.min(d.rooms, 8)));
  }

  const detailHref = (hotelId: string) =>
    `/trips/${tripId}/stay/${encodeURIComponent(hotelId)}?checkin=${result?.checkin ?? checkin}&checkout=${result?.checkout ?? checkout}&adults=${adults}&rooms=${rooms}`;
  const panelCtx = useTripPanelMaybe();
  const stayEntry = (o: StayOption): CompareEntry => ({
    id: o.hotelId, kind: "stay", name: o.name, href: detailHref(o.hotelId),
    subtitle: [o.stars ? `${o.stars}★` : null, o.boardName].filter(Boolean).join(" · ") || undefined,
    attrs: { price: `${money(o.nightlyAmount)}/night`, priceValue: o.nightlyAmount, rating: typeof o.rating === "number" && o.rating > 0 ? `${o.rating.toFixed(1)}/10` : undefined, ratingValue: typeof o.rating === "number" && o.rating > 0 ? o.rating : undefined, lat: o.latitude ?? undefined, lng: o.longitude ?? undefined, detail: [o.stars ? `${o.stars}-star` : null, o.boardName, o.refundable ? "free cancellation" : null].filter(Boolean).join(", ") || "Hotel" },
  });
  const openStay = (o: StayOption) => (e: MouseEvent) => {
    if (!panelCtx || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    if (panelCtx.compareMode) { panelCtx.compareToggle(stayEntry(o)); return; }
    panelCtx.openPanel({ kind: "stay", hotelId: o.hotelId, name: o.name, checkin: result?.checkin ?? checkin, checkout: result?.checkout ?? checkout });
  };
  const money = (n: number) => formatMoney(n, result?.currency ?? "CAD");
  const facets = result?.facets;
  const toggle = (list: string[], v: string, set: (l: string[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const toggleN = (list: number[], v: number, set: (l: number[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const activeFilters = stars.length + boards.length + propertyTypes.length + (refundable ? 1 : 0) + (priceMax ? 1 : 0);

  // A stay already booked for (some of) these nights: said up front, so nobody pays for the same nights twice.
  const alreadyBooked = booked.items.find((item) => item.date && checkin && checkout && item.date < checkout && (item.endDate ?? item.date) > checkin && item.status !== "cancelled");

  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col gap-5">
      <CityChips stops={cities.stops} current={cities.city} onPick={cities.setCity} estimated={cities.estimated} className={cn("-mb-2", PHONE_V2 && "max-lg:hidden")} />
      {alreadyBooked && (
        <p role="status" className="rounded-2xl bg-secondary px-4 py-3 text-sm">
          You already have <span className="font-medium">{alreadyBooked.title}</span> booked<span className={cn(PHONE_V2 && "max-lg:hidden")}>{alreadyBooked.date ? ` (${fmtDay(alreadyBooked.date)}${alreadyBooked.endDate ? ` → ${fmtDay(alreadyBooked.endDate)}` : ""})` : ""}</span> for some of these nights.{" "}
          <a href={`/trips/${tripId}/bookings`} className="underline underline-offset-2">See your bookings</a>
        </p>
      )}
      {near.trim() && (
        <p className="flex items-center gap-2 text-sm">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-coral" />
          <span className="min-w-0 truncate">Searching near <span className="font-medium">{near}</span></span>
          <button type="button" onClick={() => setNear("")} className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-3 w-3" /> clear
          </button>
        </p>
      )}

      {/* The booking bar: four cells divided by hairlines (the gap shows the border colour through), then filters and sort. */}
      <div className={cn("overflow-hidden rounded-4xl bg-card shadow-float ring-1 ring-black/[0.05]", PHONE_V2 && "max-lg:overflow-visible max-lg:rounded-none max-lg:bg-transparent max-lg:shadow-none max-lg:ring-0")}>
        {/* On a phone the four fields fold into one line (dates, guests, rooms) that opens them: the list starts a screen sooner. */}
        <button
          type="button"
          onClick={() => setBarOpen((v) => !v)}
          aria-expanded={barOpen}
          className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left sm:hidden", PHONE_V2 && "max-lg:mb-3 max-lg:min-h-[3.25rem] max-lg:rounded-full max-lg:border max-lg:border-hairline max-lg:bg-card max-lg:px-4 max-lg:py-2")}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-lg leading-tight font-medium tracking-[-0.015em] tabular-nums">
              {checkin && checkout ? <>{fmtDay(checkin)} <span aria-hidden className={cn("mx-0.5 text-coral", PHONE_V2 && "max-lg:text-foreground")}>{PHONE_V2 ? "–" : "→"}</span> {fmtDay(checkout)}</> : "Choose your dates"}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {nightsLabel ? `${nightsLabel} · ` : ""}{adults} guest{adults === 1 ? "" : "s"} · {rooms} room{rooms === 1 ? "" : "s"}
            </span>
          </span>
          <span className={cn("inline-flex h-8 items-center gap-1 rounded-full px-3.5 text-xs font-medium transition-colors", barOpen ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground", PHONE_V2 && "max-lg:h-auto max-lg:border-0 max-lg:bg-transparent max-lg:px-0 max-lg:text-muted-foreground max-lg:[&>span]:hidden")}>
            <span>{barOpen ? "Done" : "Edit"}</span> <ChevronDown className={cn("size-3.5 transition-transform duration-300", barOpen && "rotate-180", PHONE_V2 && "max-lg:size-[1.125rem]")} aria-hidden />
          </span>
        </button>
        <div className={cn("grid grid-cols-2 gap-px overflow-hidden bg-border max-sm:border-t max-sm:border-border lg:grid-cols-4", !barOpen && "max-sm:hidden", PHONE_V2 && "max-lg:mb-3 max-lg:gap-2 max-lg:overflow-visible max-lg:border-0 max-lg:bg-transparent")}>
          <DateCell label="Check-in" value={checkin} onChange={setCheckin} />
          <DateCell label="Check-out" value={checkout} onChange={setCheckout} min={checkin || undefined} />
          <Stepper label="Guests" value={adults} set={setAdults} min={1} max={16} />
          <Stepper label="Rooms" value={rooms} set={setRooms} min={1} max={8} />
        </div>

        <div className={cn("flex flex-wrap items-center gap-3 border-t border-border bg-card px-4 py-3", PHONE_V2 && "max-lg:-mx-5 sm:max-lg:-mx-8 max-lg:flex-nowrap max-lg:gap-2 max-lg:overflow-x-auto max-lg:border-t-0 max-lg:bg-transparent max-lg:px-5 sm:max-lg:px-8 max-lg:py-0 max-lg:[-ms-overflow-style:none] max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden")}>
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-pressed={showFilters} className="btn-chip shrink-0 max-lg:h-10 max-lg:text-sm">
            <SlidersHorizontal className="size-3.5" aria-hidden /> Filters{activeFilters ? ` · ${activeFilters}` : ""}
          </button>
          <label className={cn("flex shrink-0 items-center gap-2 text-xs text-muted-foreground", PHONE_V2 && "max-lg:hidden")}>
            Sort
            <span className="relative">
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-8 max-lg:h-10 max-lg:text-sm cursor-pointer appearance-none rounded-full border border-border bg-background pr-8 pl-3.5 text-xs font-medium text-ink-soft transition-colors hover:border-ink/30 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <option value="price">Price</option>
                <option value="rating">Guest rating</option>
                <option value="stars">Stars</option>
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </span>
          </label>
          {PHONE_V2 && (
            <button type="button" onClick={() => setRefundable((v) => !v)} aria-pressed={refundable} className="btn-chip shrink-0 max-lg:h-10 max-lg:text-sm lg:hidden">
              Free cancellation
            </button>
          )}
          {status && <p role="status" className={cn("ml-auto text-xs text-muted-foreground", PHONE_V2 && "max-lg:hidden")}>{status}</p>}
        </div>

        {showFilters && facets && (
          <div className={cn("space-y-4 border-t border-border px-4 py-4", PHONE_V2 && "max-lg:mt-3 max-lg:rounded-2xl max-lg:border max-lg:bg-card")}>
            {PHONE_V2 && (
              <div className="lg:hidden">
                <span className="text-sm font-medium">Sort by</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {([["price", "Price"], ["rating", "Guest rating"], ["stars", "Stars"]] as const).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setSort(key)} aria-pressed={sort === key} className="btn-chip">{label}</button>
                  ))}
                </div>
              </div>
            )}
            {facets.priceMax > facets.priceMin && (
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Max price / night</span>
                  <span className="text-muted-foreground tabular-nums">{money(priceMax ?? facets.priceMax)}</span>
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
            {facets.propertyTypes.length > 1 && (
              <div>
                <span className="text-sm font-medium">Type of place</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {facets.propertyTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggle(propertyTypes, t, setPropertyTypes)}
                      aria-pressed={propertyTypes.includes(t)}
                      className="btn-chip"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {facets.stars.length > 0 && (
              <div>
                <span className="text-sm font-medium">Star rating</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {facets.stars.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleN(stars, s, setStars)}
                      aria-pressed={stars.includes(s)}
                      className="btn-chip"
                    >
                      {s} <Star className="h-3 w-3 fill-current" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {facets.boards.length > 0 && (
              <div>
                <span className="text-sm font-medium">Board</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {facets.boards.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => toggle(boards, b, setBoards)}
                      aria-pressed={boards.includes(b)}
                      className="btn-chip"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={refundable} onChange={(e) => setRefundable(e.target.checked)} className="accent-primary" />
              Free cancellation only
            </label>
            {activeFilters > 0 && (
              <button type="button" onClick={() => { setStars([]); setBoards([]); setPropertyTypes([]); setRefundable(false); setPriceMax(null); }} className="text-xs font-medium text-primary hover:underline">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <SwapView id={loading && !result ? "skeleton" : "results"}>
      {loading && !result ? (
        <SkeletonList count={6} className="xl:grid-cols-3" />
      ) : result && result.options.length > 0 ? (
        <>
          {result.assumedDates && <p className="text-xs text-caution">Example dates, set yours above for accurate prices.</p>}
          <ul className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", PHONE_V2 && "max-lg:gap-x-5 max-lg:gap-y-7")}>
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
      ) : (
        !loading && (
          <EmptyState icon={BedDouble} action={status.startsWith("We couldn't") ? <button type="button" onClick={() => void search()} className="btn-primary h-11 rounded-full px-6">Try again</button> : undefined}>{status || "No stays to show yet."}</EmptyState>
        )
      )}
        </SwapView>
      </div>

      {/* Last in the column so it can rest on the bottom edge of the page (see `.ask-dock`). */}
      <AiSearchBar
        variant="dock"
        tripId={tripId}
        scope="stays"
        placeholder={phone ? "Ask Roam about stays" : `Ask — “near ${destination ? destination.split(",")[0] : "the old town"} station, under 250 a night, free cancellation”`}
        onDirective={applyDirective}
      />
    </div>
  );
}
