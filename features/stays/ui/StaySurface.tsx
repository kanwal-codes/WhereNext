"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { SwapView } from "@/components/SwapView";
import { StayResultCard } from "@/features/stays/ui/StayResultCard";
import { BedDouble, ChevronDown, Loader2, MapPin, Minus, Plus, SlidersHorizontal, Star, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { AiSearchBar } from "@/components/AiSearchBar";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { readStayDecision, type StayFacets, type StayOption } from "@/packages/contracts/stay";
import { SkeletonCards } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { formatMoney } from "@/lib/currency";
import { useShowMore } from "@/lib/use-show-more";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { cn } from "@/lib/utils";
import { fmtDay } from "@/lib/trip-dates";
import { cachedGet } from "@/lib/client/cached-get";

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
  const btn = "grid size-8 place-items-center rounded-full border border-input text-ink-soft transition-[background-color,border-color,transform] hover:border-foreground/30 hover:bg-accent active:scale-90 disabled:opacity-35 disabled:hover:bg-transparent";
  return (
    <div className="bg-card px-4 py-3">
      <span className="eyebrow block">{label}</span>
      <div className="mt-1.5 flex items-center gap-3">
        <button type="button" onClick={() => set(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`} className={btn}>
          <Minus className="size-3.5" />
        </button>
        <span className="w-6 text-center text-base font-medium tabular-nums">{value}</span>
        <button type="button" onClick={() => set(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`} className={btn}>
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function StaySurface({ tripId, destination }: { tripId: string; destination: string }) {
  const { data } = useTripData();
  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);
  const router = useRouter();
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

  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col gap-5">
      {near.trim() && (
        <p className="flex items-center gap-2 text-sm">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-coral" />
          <span className="min-w-0 truncate">Searching near <span className="font-medium">{near}</span></span>
          <button type="button" onClick={() => setNear("")} className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" /> clear
          </button>
        </p>
      )}

      {/* The booking bar: four cells divided by hairlines (the gap shows the border colour through), then filters and sort. */}
      <div className="rounded-3xl border border-border bg-card shadow-soft">
        <div className="grid gap-px overflow-hidden rounded-t-3xl bg-border grid-cols-2 lg:grid-cols-4">
          <label className="col-span-2 block cursor-pointer bg-card px-4 py-3 transition-colors focus-within:bg-accent/50 hover:bg-accent/40 sm:col-span-1">
            <span className="eyebrow block">Check-in</span>
            <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} className="mt-1.5 block w-full bg-transparent text-base font-medium outline-none" />
          </label>
          <label className="col-span-2 block cursor-pointer bg-card px-4 py-3 transition-colors focus-within:bg-accent/50 hover:bg-accent/40 sm:col-span-1">
            <span className="eyebrow block">Check-out</span>
            <input type="date" value={checkout} min={checkin || undefined} onChange={(e) => setCheckout(e.target.value)} className="mt-1.5 block w-full bg-transparent text-base font-medium outline-none" />
          </label>
          <Stepper label="Guests" value={adults} set={setAdults} min={1} max={16} />
          <Stepper label="Rooms" value={rooms} set={setRooms} min={1} max={8} />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-pressed={showFilters} className="btn-chip">
            <SlidersHorizontal className="size-3.5" aria-hidden /> Filters{activeFilters ? ` · ${activeFilters}` : ""}
          </button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Sort
            <span className="relative">
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-8 cursor-pointer appearance-none rounded-full border border-border bg-background pr-8 pl-3.5 text-xs font-medium text-ink-soft transition-colors hover:border-ink/30 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <option value="price">Price</option>
                <option value="rating">Guest rating</option>
                <option value="stars">Stars</option>
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </span>
          </label>
          {status && <p role="status" className="ml-auto text-xs text-muted-foreground">{status}</p>}
        </div>

        {showFilters && facets && (
          <div className="space-y-4 border-t border-border px-4 py-4">
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
        <SkeletonCards count={6} />
      ) : result && result.options.length > 0 ? (
        <>
          {result.assumedDates && <p className="text-xs text-caution">Example dates, set yours above for accurate prices.</p>}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.options.slice(0, visible).map((o, index) => {
              const comparing = Boolean(panelCtx?.compareMode);
              return (
                <li key={o.hotelId} className={cn("min-w-0", index >= first && "settle-in")}>
                  <StayResultCard
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
          <EmptyState icon={BedDouble}>{status || "No stays to show yet."}</EmptyState>
        )
      )}
        </SwapView>
      </div>

      {/* Last in the column so it can rest on the bottom edge of the page (see `.ask-dock`). */}
      <AiSearchBar
        variant="dock"
        tripId={tripId}
        scope="stays"
        placeholder={`Ask — “near ${destination ? destination.split(",")[0] : "the old town"} station, under 250 a night, free cancellation”`}
        onDirective={applyDirective}
      />
    </div>
  );
}
