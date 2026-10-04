"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, BedDouble, Check, ChevronDown, Loader2, MapPin, Minus, Plus, SlidersHorizontal, Star, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { AiSearchBar } from "@/components/AiSearchBar";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { readStayDecision, type StayFacets, type StayOption } from "@/packages/contracts/stay";
import { SkeletonCards } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { formatMoney } from "@/lib/currency";
import { useInfiniteReveal } from "@/lib/use-infinite-reveal";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { cn } from "@/lib/utils";
import { fmtDay } from "@/lib/trip-dates";
import { cachedGet } from "@/lib/client/cached-get";
import { BlurImage } from "@/components/motion-primitives";
import { MediaFallback } from "@/features/conversation/ui/blocks/ui";

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

function Stepper({ label, value, set, min, max }: { label: string; value: number; set: (n: number) => void; min: number; max: number }) {
  return (
    <div>
      <span className="block text-sm font-medium">{label}</span>
      <div className="mt-1.5 flex h-11 w-fit items-center gap-3 rounded-full border border-input px-2">
        <button type="button" onClick={() => set(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`} className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground disabled:opacity-30 hover:text-foreground">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-5 text-center text-sm tabular-nums">{value}</span>
        <button type="button" onClick={() => set(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`} className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground disabled:opacity-30 hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** A hotel photo that falls back to the same soft stand-in as every other card when it is missing or fails to load (alt text in display type is not a fallback). */
function StayPhoto({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <MediaFallback icon={BedDouble} className={cn(className, "[&_svg]:size-10")} />;
  return <BlurImage src={src} alt={alt} onError={() => setFailed(true)} className={className} />;
}

export function StaySurface({ tripId, destination }: { tripId: string; destination: string }) {
  const { data } = useTripData();
  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);
  const trip = data?.trip as { start_date?: string | null; end_date?: string | null; travelers?: number | null } | undefined;

  const [checkin, setCheckin] = useState(lockedStay?.checkin ?? trip?.start_date ?? "");
  const [checkout, setCheckout] = useState(lockedStay?.checkout ?? trip?.end_date ?? "");
  const [adults, setAdults] = useState(Math.max(1, Math.min(trip?.travelers ?? 2, 24)));
  const [rooms, setRooms] = useState(1);
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
  }, [tripId, adults, rooms, sort, checkin, checkout, stars, boards, propertyTypes, refundable, priceMax, near]);

  useEffect(() => {
    void search();
  }, [search]);

  const { visible, sentinel, more } = useInfiniteReveal(result?.options.length ?? 0, 6, result);

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

  return (
    <div className="space-y-5">
      {lockedStay && (
        <Link
          href={detailHref(lockedStay.hotelId)}
          className="flex gap-4 rounded-2xl border border-leaf/30 bg-leaf-soft/40 p-4 transition-colors hover:bg-leaf-soft/60"
        >
          <StayPhoto src={lockedStay.thumbnail} alt={lockedStay.hotelName} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow inline-flex items-center gap-1 text-leaf">
              <Check className="h-3 w-3" /> Your stay
            </p>
            <p className="mt-1 truncate font-display text-lg">{lockedStay.hotelName}</p>
            <p className="truncate text-sm text-ink-soft">{lockedStay.roomName}{lockedStay.board ? ` · ${lockedStay.board}` : ""}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {fmtDay(lockedStay.checkin)} → {fmtDay(lockedStay.checkout)} · {lockedStay.nights} night{lockedStay.nights === 1 ? "" : "s"} ·{" "}
              <span className="font-medium text-foreground tabular-nums">{formatMoney(lockedStay.totalAmount, lockedStay.currency)}</span> total
            </p>
          </div>
          <span className="hidden shrink-0 self-center text-xs font-medium text-primary sm:inline-flex sm:items-center sm:gap-1">
            Change <ArrowUpRight className="h-3 w-3" />
          </span>
        </Link>
      )}

      <AiSearchBar
        tripId={tripId}
        scope="stays"
        placeholder={`Ask — “near ${destination ? destination.split(",")[0] : "the old town"} station, under 250 a night, free cancellation”`}
        onDirective={applyDirective}
      />

      {near.trim() && (
        <p className="flex items-center gap-2 text-sm">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-coral" />
          <span className="min-w-0 truncate">Searching near <span className="font-medium">{near}</span></span>
          <button type="button" onClick={() => setNear("")} className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" /> clear
          </button>
        </p>
      )}

      {/* Search controls */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <p className="eyebrow">Where to stay</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Hotels, apartments and guesthouses in {near.trim() || destination || "your destination"}, priced for your dates and party.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm font-medium">
            Check-in
            <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} className="input-field" />
          </label>
          <label className="block text-sm font-medium">
            Check-out
            <input type="date" value={checkout} min={checkin || undefined} onChange={(e) => setCheckout(e.target.value)} className="input-field" />
          </label>
          <div className="grid grid-cols-2 gap-4 sm:contents">
            <Stepper label="Guests" value={adults} set={setAdults} min={1} max={16} />
            <Stepper label="Rooms" value={rooms} set={setRooms} min={1} max={8} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setShowFilters((v) => !v)} className="btn-secondary">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Sort
            <span className="relative">
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-10 cursor-pointer appearance-none rounded-full border border-border bg-background pr-9 pl-4 text-sm text-foreground transition-colors hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <option value="price">Price</option>
              <option value="rating">Guest rating</option>
              <option value="stars">Stars</option>
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            </span>
          </label>
        </div>

        {showFilters && facets && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
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
                      className={cn("rounded-full border px-2.5 py-1 text-xs", propertyTypes.includes(t) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-ink-soft")}
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
                      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", stars.includes(s) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-ink-soft")}
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
                      className={cn("rounded-full border px-2.5 py-1 text-xs", boards.includes(b) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-ink-soft")}
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
        {status && <p role="status" className="mt-3 text-xs text-muted-foreground">{status}</p>}
      </div>

      {loading && !result ? (
        <SkeletonCards count={6} />
      ) : result && result.options.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            {result.options.length} place{result.options.length === 1 ? "" : "s"} · {result.nights} night{result.nights > 1 ? "s" : ""} · {fmtDay(result.checkin)} → {fmtDay(result.checkout)}
            {result.assumedDates ? " · example dates (set yours above)" : ""} · {result.adults} guest{result.adults === 1 ? "" : "s"}, {result.rooms} room{result.rooms === 1 ? "" : "s"}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.options.slice(0, visible).map((o) => {
              const locked = lockedStay?.hotelId === o.hotelId;
              return (
                <li key={o.hotelId} className={cn("card-lift flex flex-col overflow-hidden rounded-2xl border bg-card shadow-soft", locked ? "border-leaf/40" : "border-border")}>
                  {/* The title below is the named link to the same place; the photo is a second way to press it, so assistive tech and the tab key skip it (as on every other card). */}
                  <Link href={detailHref(o.hotelId)} onClick={openStay(o)} aria-hidden tabIndex={-1} className="block aspect-[16/10] shrink-0 overflow-hidden bg-muted">
                    <StayPhoto src={o.thumbnail} alt={o.name} className="h-full w-full object-cover" />
                  </Link>
                  <div className="flex min-h-0 flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      {/* line-clamp-2, not truncate — a real hotel name ("Holiday Inn Hotel &
                          Suites - Montreal Centre-ville Ouest by IHG") was cutting off almost
                          immediately on a narrow card; this list item's height is already
                          content-driven (no fixed height to fight), so 2 lines costs nothing. */}
                      <Link href={detailHref(o.hotelId)} onClick={openStay(o)} className="min-w-0 flex-1 line-clamp-2 font-display text-base leading-tight underline-offset-4 decoration-1 hover:underline">{o.name}</Link>
                      {locked && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-leaf-soft px-2 py-0.5 text-2xs font-medium text-leaf">
                          <Check className="h-3 w-3" /> Locked
                        </span>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {o.propertyType && o.propertyType !== "Hotel" && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-2xs font-medium text-ink-soft">{o.propertyType}</span>
                      )}
                      {typeof o.stars === "number" && o.stars > 0 && <span>{o.stars}★</span>}
                      {typeof o.rating === "number" && o.rating > 0 && (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <Star className="h-3 w-3 fill-current text-coral" />
                          {o.rating.toFixed(1)}/10{o.reviewCount ? <span className="font-normal text-muted-foreground"> ({o.reviewCount.toLocaleString()})</span> : null}
                        </span>
                      )}
                      {o.boardName && <span>{o.boardName}</span>}
                      {o.refundable && <span className="text-leaf">Free cancellation</span>}
                    </p>
                    <div className="mt-auto flex items-end justify-between pt-3">
                      <span className="text-sm font-semibold tabular-nums">
                        {money(o.nightlyAmount)}
                        <span className="block text-2xs font-normal text-muted-foreground">/night · {money(o.totalAmount)} total</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {panelCtx?.compareMode && <span className="text-2xs text-muted-foreground">{panelCtx.compareHas(o.hotelId) ? "Selected" : "Select in compare mode"}</span>}
                        <Link href={detailHref(o.hotelId)} onClick={openStay(o)} className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline">
                          View <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {more && <div ref={sentinel} aria-hidden className="h-8" />}
          <p className="text-xs text-muted-foreground">Prices shown in {result.currency}. Taxes and fees may be added at checkout — confirm the total when you book.</p>
        </>
      ) : (
        !loading && (
          <EmptyState icon={BedDouble}>{status || "No stays to show yet."}</EmptyState>
        )
      )}
    </div>
  );
}
