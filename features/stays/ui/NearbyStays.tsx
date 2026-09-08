"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BedDouble, ChevronRight, MapPin, Star } from "lucide-react";
import { useTripPanelMaybe } from "@/components/TripPanelProvider";
import Link from "next/link";
import type { StayOption } from "@/packages/contracts/stay";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Order = "nearby" | "price" | "rating";
type Kind = "Hotel" | "Motel" | "Hostel / dorm" | "Apartment-style";

const distanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180;
  const lat = (b.lat - a.lat) * rad;
  const lng = (b.lng - a.lng) * rad;
  const n = Math.sin(lat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(n));
};

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
  const [order, setOrder] = useState<Order>(initialOrder);
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
    let cancelled = false;
    const load = async () => {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const entry = JSON.parse(cached) as { savedAt?: number; options?: StayOption[] };
          if (Array.isArray(entry.options) && Date.now() - (entry.savedAt ?? 0) < 5 * 60_000) {
            if (!cancelled) setOptions(entry.options);
            setLoading(false);
            return;
          }
        }
      } catch { /* storage is optional */ }
      try {
        const response = await fetch(`/api/trips/${tripId}/stays?${qs}`);
        const body = await response.json() as { options?: StayOption[] };
        if (!response.ok || cancelled) return;
        const next = Array.isArray(body.options) ? body.options : [];
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), options: next })); } catch { /* storage is optional */ }
        setOptions(next);
      } catch { /* alternatives are optional content */ }
      if (!cancelled) setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [tripId, location, checkin, checkout, adults]);

  const matched = useMemo(() => {
    const next = options
      .filter((option) => option.hotelId !== currentHotelId)
      .map((option) => ({ option, distance: anchor && option.latitude != null && option.longitude != null ? distanceKm(anchor, { lat: option.latitude, lng: option.longitude }) : null, kind: stayKind(option.name) }))
      .filter((entry) => kind === "All" || entry.kind === kind);
    next.sort((a, b) => order === "price" ? a.option.nightlyAmount - b.option.nightlyAmount : order === "rating" ? (b.option.rating ?? 0) - (a.option.rating ?? 0) : (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY));
    return next;
  }, [options, currentHotelId, anchor, order, kind]);
  const alternatives = mode === "full" ? matched : matched.slice(0, 3);
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

  return (
    <section className="border-t border-border/70 pt-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-coral">Nearby alternatives</p>
          <h2 className="mt-1 font-display text-xl">Other places to stay</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">A short list around this hotel, priced for your dates.</p>
        </div>
        {mode === "preview" ? (
          <Link href={seeMoreHref} className="shrink-0 text-xs font-medium text-primary hover:underline">See more <span aria-hidden="true">→</span></Link>
        ) : <BedDouble className="mt-1 h-5 w-5 text-coral" aria-hidden="true" />}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Alternative stay sorting">
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Sort</span>
        {(["nearby", "price", "rating"] as Order[]).map((value) => (
          <button key={value} type="button" onClick={() => setOrder(value)} className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", order === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground")}>
            {value === "nearby" ? "Closest" : value === "price" ? "Best price" : "Guest score"}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Type</span>
        {(["All", ...availableKinds] as Array<Kind | "All">).map((value) => (
          <button key={value} type="button" onClick={() => setKind(value)} className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", kind === value ? "border-coral bg-coral-soft text-coral" : "border-border bg-background text-muted-foreground hover:text-foreground")}>
            {value}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="h-28 animate-pulse rounded-2xl bg-muted" /><div className="h-28 animate-pulse rounded-2xl bg-muted" /></div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {alternatives.map(({ option, distance, kind: optionKind }) => {
            const open = () => panel?.openPanel({ kind: "stay", hotelId: option.hotelId, name: option.name, checkin, checkout });
            const content = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="eyebrow">{optionKind}</p><p className="mt-1 truncate font-display text-base">{option.name}</p></div>
                  {option.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- provider image URL is arbitrary
                    <img src={option.thumbnail} alt="" loading="lazy" width={64} height={48} className="h-12 w-16 shrink-0 rounded-lg object-cover" />
                  ) : <div className="grid h-12 w-16 shrink-0 place-items-center rounded-lg bg-muted"><BedDouble className="h-4 w-4 text-muted-foreground" /></div>}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{formatMoney(option.nightlyAmount, option.currency || currency)}<span className="font-normal text-muted-foreground"> / night</span></span>
                  {typeof option.rating === "number" && <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-current text-coral" /> {option.rating.toFixed(1)}</span>}
                  {distance != null && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</span>}
                </div>
              </>
            );
            return panel ? <button key={option.hotelId} type="button" onClick={open} className="group rounded-lg border border-border/80 bg-card/70 p-4 text-left transition-colors hover:border-primary/40 hover:bg-card">{content}<span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">View stay <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span></button> : <a key={option.hotelId} href={`/trips/${tripId}/stay/${encodeURIComponent(option.hotelId)}?checkin=${checkin ?? ""}&checkout=${checkout ?? ""}`} className="group rounded-lg border border-border/80 bg-card/70 p-4 transition-colors hover:border-primary/40 hover:bg-card">{content}<span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">View stay <ArrowUpRight className="h-3.5 w-3.5" /></span></a>;
          })}
        </div>
      )}
      {mode === "preview" && !loading && matched.length > alternatives.length && (
        <Link href={seeMoreHref} className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
          See all {matched.length} {kind === "All" ? "stays" : kind.toLowerCase()} <span aria-hidden="true">→</span>
        </Link>
      )}
      <p className="mt-4 text-[11px] text-muted-foreground">Prices are an estimate for the selected dates and can change.</p>
    </section>
  );
}
