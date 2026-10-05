"use client";

import { HotelPhoto } from "@/components/HotelPhoto";
import { useEffect, useMemo, useState } from "react";
import { useShowMore } from "@/lib/use-show-more";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { ArrowUpRight, BedDouble, ChevronRight, MapPin, Star } from "lucide-react";
import { useTripPanelMaybe } from "@/components/TripPanelProvider";
import { Skeleton } from "@/components/Skeleton";
import Link from "next/link";
import type { StayOption } from "@/packages/contracts/stay";
import { formatMoney } from "@/lib/currency";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { haversineKm } from "@/lib/application/geo";
import { cn } from "@/lib/utils";
import { cachedGet } from "@/lib/client/cached-get";

type Order = "nearby" | "price" | "rating";
type Kind = "Hotel" | "Motel" | "Hostel / dorm" | "Apartment-style";

// Was a private re-implementation of `lib/application/geo.ts`'s `haversineKm` — see that
// function's `Math.min(1, ...)` clamp before `Math.asin()`, missing here (and in two other
// duplicate copies found across the codebase — TripPanel.tsx and route-plan/route.ts — all
// now pointed at this same shared implementation instead).
const distanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  haversineKm({ latitude: a.lat, longitude: a.lng }, { latitude: b.lat, longitude: b.lng });

const stayKind = (name: string): Kind => {
  if (/hostel|dorm/i.test(name)) return "Hostel / dorm";
  if (/motel/i.test(name)) return "Motel";
  if (/apartment|residence|suite/i.test(name)) return "Apartment-style";
  return "Hotel";
};

export function NearbyStays({
  tripId,
  currentHotelId,
  location,
  checkin,
  checkout,
  adults = 2,
  anchor,
  currency = "CAD",
  mode = "preview",
  initialOrder = "nearby",
  initialKind = "All",
}: {
  tripId: string;
  currentHotelId: string;
  location: string;
  checkin?: string;
  checkout?: string;
  adults?: number;
  anchor?: { lat: number; lng: number } | null;
  currency?: string;
  mode?: "preview" | "full";
  /** Seeds the sort/type filter — lets "See more" land here with the same filter already applied. */
  initialOrder?: Order;
  initialKind?: Kind | "All";
}) {
  const panel = useTripPanelMaybe();
  const [options, setOptions] = useState<StayOption[]>([]);
  const [order, setOrder] = useState<Order>(initialOrder === "nearby" && !anchor ? "rating" : initialOrder);
  const [kind, setKind] = useState<Kind | "All">(initialKind);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!location.trim()) {
      setLoading(false);
      return;
    }
    const qs = new URLSearchParams({ location, adults: String(adults), rooms: "1", sort: "price" });
    if (checkin) qs.set("checkin", checkin);
    if (checkout) qs.set("checkout", checkout);
    const cacheKey = `nearby-stays:${tripId}:${qs.toString()}`;
    // An AbortController, not just a `cancelled` flag — a flag only stops the state update, the
    // fetch itself kept running against the hotel provider on every location/date change. Same
    // fix DiscoverySurface already applies to its own searches.
    const controller = new AbortController();
    const load = async () => {
      const cachedOptions = readSessionCache<StayOption[]>(cacheKey, 5 * 60_000);
      if (cachedOptions) {
        setOptions(cachedOptions);
        setLoading(false);
        return;
      }
      try {
        const response = await cachedGet(`/api/trips/${tripId}/stays?${qs}`, { signal: controller.signal });
        const body = await response.json() as { options?: StayOption[] };
        if (!response.ok || controller.signal.aborted) return;
        const next = Array.isArray(body.options) ? body.options : [];
        writeSessionCache(cacheKey, next);
        setOptions(next);
      } catch { /* alternatives are optional content, including a cancelled/aborted request */ }
      if (!controller.signal.aborted) setLoading(false);
    };
    void load();
    return () => { controller.abort(); };
  }, [tripId, location, checkin, checkout, adults]);

  const matched = useMemo(() => {
    const next = options
      .filter((option) => option.hotelId !== currentHotelId)
      .map((option) => ({ option, distance: anchor && option.latitude != null && option.longitude != null ? distanceKm(anchor, { lat: option.latitude, lng: option.longitude }) : null, kind: stayKind(option.name) }))
      .filter((entry) => kind === "All" || entry.kind === kind);
    next.sort((a, b) => order === "price" ? a.option.nightlyAmount - b.option.nightlyAmount : order === "rating" ? (b.option.rating ?? 0) - (a.option.rating ?? 0) : (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY));
    return next;
  }, [options, currentHotelId, anchor, order, kind]);
  // The full list opens with 15 and grows 6 at a time; the preview inside a stay panel stays at 3.
  const more = useShowMore(matched.length, `${order}:${kind}`);
  const alternatives = mode === "full" ? matched.slice(0, more.visible) : matched.slice(0, 3);
  const availableKinds = useMemo(() => Array.from(new Set(options.filter((option) => option.hotelId !== currentHotelId).map((option) => stayKind(option.name)))), [options, currentHotelId]);

  if (!loading && alternatives.length === 0) return null;

  // Carries the active sort/type filter along, so "See more" lands on the full list already
  // narrowed the same way instead of resetting to Closest / All.
  const seeMoreHref = `/trips/${tripId}/stay/alternatives?${new URLSearchParams({
    location,
    checkin: checkin ?? "",
    checkout: checkout ?? "",
    order,
    kind,
  })}`;

  // Inside a stay: just recommendations. Three photo cards, nearest first, and the way to the rest. No filters.
  if (mode === "preview") {
    const shown = alternatives;
    return (
      <section className="border-t border-border/70 pt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl">Other places to stay</h2>
          {!loading && matched.length > shown.length && (
            <Link href={seeMoreHref} className="relative shrink-0 text-xs font-medium text-primary hover:underline after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']">See all {matched.length} <span aria-hidden="true">→</span></Link>
          )}
        </div>
        {loading ? (
          <div className="mt-4 grid grid-cols-3 gap-3"><Skeleton className="aspect-[4/5]" /><Skeleton className="aspect-[4/5]" /><Skeleton className="aspect-[4/5]" /></div>
        ) : (
          // A row of three on a laptop; a swipe row on a phone, with the next card peeking in.
          <ul className="no-scrollbar -mx-5 mt-4 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
            {shown.map(({ option, distance }) => {
              const card = (
                <>
                  <span className="relative block aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                    <HotelPhoto src={option.thumbnail} className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]" fallback={<span className="grid size-full place-items-center"><BedDouble className="size-5 text-muted-foreground" /></span>} />
                    {typeof option.rating === "number" && (
                      <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-xs font-medium tabular-nums shadow-soft backdrop-blur"><Star className="size-3 fill-current" aria-hidden />{option.rating.toFixed(1)}</span>
                    )}
                  </span>
                  <span className="mt-2.5 block truncate text-sm font-medium">{option.name}</span>
                  <span className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span><span className="font-semibold text-foreground tabular-nums">{formatMoney(option.nightlyAmount, option.currency || currency)}</span> night</span>
                    {distance != null && <span className="shrink-0 tabular-nums">{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</span>}
                  </span>
                </>
              );
              const cls = "group block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";
              return (
                <li key={option.hotelId} className="w-[62%] shrink-0 snap-start sm:w-auto">
                  {panel ? (
                    <button type="button" className={cls} onClick={() => panel.openPanel({ kind: "stay", hotelId: option.hotelId, name: option.name, checkin, checkout })}>{card}</button>
                  ) : (
                    <a className={cls} href={`/trips/${tripId}/stay/${encodeURIComponent(option.hotelId)}?checkin=${checkin ?? ""}&checkout=${checkout ?? ""}`}>{card}</a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="border-t border-border/70 pt-8">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl">Other places to stay</h2>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">A short list around this hotel, priced for your dates.</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Alternative stay sorting">
        <span className="text-xs text-muted-foreground">Sort</span>
        {((anchor ? ["nearby", "price", "rating"] : ["price", "rating"]) as Order[]).map((value) => (
          <button key={value} type="button" onClick={() => setOrder(value)} className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", order === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground")}>
            {value === "nearby" ? "Nearest to this hotel" : value === "price" ? "Best price" : "Guest score"}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">Type</span>
        {(["All", ...availableKinds] as Array<Kind | "All">).map((value) => (
          <button key={value} type="button" onClick={() => setKind(value)} className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", kind === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground")}>
            {value}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {alternatives.map(({ option, distance, kind: optionKind }) => {
            const open = () => panel?.openPanel({ kind: "stay", hotelId: option.hotelId, name: option.name, checkin, checkout });
            const content = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-xs text-muted-foreground">{optionKind}</p><p className="mt-0.5 truncate font-display text-base font-semibold">{option.name}</p></div>
                  <HotelPhoto src={option.thumbnail} width={64} height={48} className="h-12 w-16 shrink-0 rounded-lg object-cover" fallback={<div className="grid h-12 w-16 shrink-0 place-items-center rounded-lg bg-muted"><BedDouble className="h-4 w-4 text-muted-foreground" /></div>} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{formatMoney(option.nightlyAmount, option.currency || currency)}<span className="font-normal text-muted-foreground"> / night</span></span>
                  {typeof option.rating === "number" && <span className="tabular-nums">{option.rating.toFixed(1)}/10</span>}
                  {distance != null && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</span>}
                </div>
              </>
            );
            return panel ? <button key={option.hotelId} type="button" onClick={open} className="group rounded-lg border border-border/80 bg-card/70 p-4 text-left transition-colors hover:border-primary/40 hover:bg-card">{content}<span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">View stay <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span></button> : <a key={option.hotelId} href={`/trips/${tripId}/stay/${encodeURIComponent(option.hotelId)}?checkin=${checkin ?? ""}&checkout=${checkout ?? ""}`} className="group rounded-lg border border-border/80 bg-card/70 p-4 transition-colors hover:border-primary/40 hover:bg-card">{content}<span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">View stay <ArrowUpRight className="h-3.5 w-3.5" /></span></a>;
          })}
        </div>
      )}
      {mode === "full" && !loading && <div className="mt-4"><ShowMoreButton next={more.next} visible={more.visible} total={matched.length} onClick={more.showMore} /></div>}
    </section>
  );
}
