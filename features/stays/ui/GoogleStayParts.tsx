"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Bus, Car, Check, Footprints, MapPin, Minus, Plane, TrainFront, TrendingDown, TrendingUp } from "lucide-react";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import type { useStayDetails } from "@/features/stays/application/useStayDetails";
import { Badge, Notice, RatingMeta, money, prettyDate, type as T } from "@/features/conversation/ui/blocks/ui";
import { cn, safeHref } from "@/lib/utils";
import type { StayNearbyPlace, StayTheme } from "@/packages/contracts/stay";

type Details = ReturnType<typeof useStayDetails>;

/** Google's read on this hotel's price for the dates against what it usually costs. */
function PriceRead({ s }: { s: Details }) {
  const r = s.priceRead;
  if (!r) return null;
  const tone = { low: { Icon: TrendingDown, text: "A low price for this hotel", cls: "bg-positive-soft text-positive" }, typical: { Icon: Minus, text: "A typical price for this hotel", cls: "bg-muted text-ink-soft" }, high: { Icon: TrendingUp, text: "Higher than usual for this hotel", cls: "bg-caution-soft text-caution" } }[r.level];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl px-4 py-2.5 text-sm", tone.cls)} role="note">
      <tone.Icon className="size-4 shrink-0" aria-hidden />
      <span className="font-medium">{tone.text}</span>
      <span className="text-xs opacity-80">Usually {money(r.typicalLow, r.currency, true)} to {money(r.typicalHigh, r.currency, true)} a night</span>
    </div>
  );
}

/** Every site that sells this hotel for the dates, cheapest first: the price each charges, whether it cancels free, and the way there. */
export function WhereToBook({ s, hotelId }: { s: Details; hotelId: string }) {
  const reduce = useReducedMotion();
  const locked = s.lockedStay && s.lockedStay.hotelId === hotelId ? s.lockedStay : null;
  const dates = s.checkin && s.checkout ? `${prettyDate(s.checkin)} – ${prettyDate(s.checkout)}` : null;
  const lowest = s.sources[0]?.nightly;
  const uniqueLowest = s.sources.filter((x) => x.nightly === lowest).length === 1;
  return (
    <section aria-labelledby="stay-book" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <DetailSectionHeading id="stay-book">Where to book</DetailSectionHeading>
        {dates && <p className={cn(T.meta, "tabular-nums")}>{dates}{s.nights ? ` · ${s.nights} night${s.nights === 1 ? "" : "s"}` : ""}</p>}
      </div>
      {s.assumedDates && <Notice tone="caution">These are example dates. Set your real dates to see accurate prices.</Notice>}
      <PriceRead s={s} />
      {s.sources.length === 0 ? (
        <Notice>No prices came back for these dates. The hotel may be full, or try different dates.</Notice>
      ) : (
        <>
          <ul className="space-y-2.5">
            {s.sources.map((src, i) => {
              const href = safeHref(src.link);
              return (
                <motion.li
                  key={src.source}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 6) * 0.05 }}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft"
                >
                  <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-black/10">
                    {src.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a site's own logo from Google Hotels
                      <img src={src.logo} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-7 object-contain" />
                    ) : (
                      <span aria-hidden className="text-xs font-semibold text-muted-foreground">{src.source.slice(0, 2).toUpperCase()}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                      {src.source}
                      {src.official && <Badge>Official site</Badge>}
                      {uniqueLowest && i === 0 && <Badge tone="positive" icon={Check}>Lowest price</Badge>}
                    </p>
                    {src.freeCancellation && <p className="text-xs text-positive">Free cancellation{src.cancelUntil ? ` until ${src.cancelUntil}` : ""}</p>}
                    <p className={cn(T.meta, "tabular-nums")}>
                      {money(src.total, s.currency, true)} total{src.totalBeforeTaxes ? ` · ${money(src.totalBeforeTaxes, s.currency, true)} before taxes` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-lg font-semibold leading-tight tabular-nums">{money(src.nightly, s.currency, true)}</p>
                    <p className={T.meta}>a night</p>
                  </div>
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Book on ${src.source} (opens their site)`}
                      className={cn("grid size-10 shrink-0 place-items-center rounded-full transition-[transform,opacity,background-color] active:scale-95", i === 0 ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-border text-ink-soft hover:bg-accent hover:text-foreground")}
                    >
                      <ArrowUpRight className="size-4" aria-hidden />
                    </a>
                  )}
                </motion.li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {locked ? (
              <Badge tone="positive" icon={Check}>Your stay</Badge>
            ) : (
              <button type="button" className="btn-primary-sm" disabled={s.busy} onClick={() => void s.lockSource(s.sources[0]!)}>
                {s.busy ? "Saving…" : "Make this my stay"}
              </button>
            )}
          </div>
          <Notice>You book on the site you pick. Prices and availability change, and taxes and fees are shown as each site lists them.</Notice>
        </>
      )}
    </section>
  );
}

/** What guests mention, by theme, with how much of it is praise. */
export function StayThemes({ themes }: { themes: StayTheme[] }) {
  if (themes.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-medium">What guests keep mentioning</p>
      <ul className="mt-3 space-y-3">
        {themes.map((t) => {
          const pct = (n: number) => `${(n / t.total) * 100}%`;
          return (
            <li key={t.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{t.name}</span>
                <span className={cn(T.meta, "tabular-nums")}>{t.positive} of {t.total} positive</span>
              </div>
              <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${t.name}: ${t.positive} positive, ${t.neutral} neutral, ${t.negative} negative`}>
                <span className="bg-positive" style={{ width: pct(t.positive) }} />
                <span className="bg-muted-foreground/30" style={{ width: pct(t.neutral) }} />
                <span className="bg-caution" style={{ width: pct(t.negative) }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const modeLook = {
  walk: { Icon: Footprints, text: (m: number) => `${m} min walk` },
  transit: { Icon: Bus, text: (m: number) => `${m} min by transit` },
  taxi: { Icon: Car, text: (m: number) => `${m} min by taxi` },
  other: { Icon: MapPin, text: (m: number) => `${m} min` },
} as const;

const isHub = (n: StayNearbyPlace) => /airport|station|terminal|transit|bus|train|rail/i.test(n.category ?? "") || /airport|station|terminal|kolodvor|bahnhof|\bgare\b|estaci[oó]n|aerop/i.test(n.name);
const hubIcon = (n: StayNearbyPlace) => (/airport|aerop/i.test(`${n.category} ${n.name}`) ? Plane : /bus/i.test(`${n.category} ${n.name}`) ? Bus : TrainFront);

/** One place and the time it takes: a photo (or a glyph for a station), the name, and the quickest way, with one alternative beneath. */
function NearbyRow({ place, hub }: { place: StayNearbyPlace; hub: boolean }) {
  const [first, second] = place.ways;
  const Glyph = hub ? hubIcon(place) : MapPin;
  const look = first ? modeLook[first.mode] : null;
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-3.5 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[3rem_minmax(0,1fr)_auto]">
      {place.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- a place's photo from Google Hotels
        <img src={place.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-12 shrink-0 rounded-xl border border-border object-cover" />
      ) : (
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Glyph className="size-5" /></span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{place.name}</span>
        <span className={cn(T.meta, "mt-0.5 flex min-w-0 items-center gap-2")}>
          {place.rating ? <span className="shrink-0 whitespace-nowrap"><RatingMeta rating={place.rating} count={place.reviewCount} /></span> : null}
          {place.description ? <span className="truncate">{place.description.replace(/\.$/, "")}</span> : !place.rating && place.category && !/point of interest/i.test(place.category) ? <span className="truncate">{place.category}</span> : null}
        </span>
      </span>
      {look && first && (
        <span className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-start-3 sm:block sm:text-right">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-soft px-2.5 py-1 text-xs font-medium tabular-nums text-coral-ink">
            <look.Icon className="size-3.5" aria-hidden />
            {look.text(first.minutes)}
          </span>
          {second && <span className={cn(T.meta, "tabular-nums sm:mt-1 sm:block")}>{modeLook[second.mode].text(second.minutes)}</span>}
        </span>
      )}
    </li>
  );
}

/**
 * How far the things guests ask about are, from this door: what Google lists near the property, walkable ones first.
 * Stations and airports sit apart from sights, since they answer a different question ("how do I get in and out?").
 * It is about reaching them; "Around here" below is about what to do.
 */
export function StayNearby({ nearby }: { nearby: StayNearbyPlace[] }) {
  if (nearby.length === 0) return null;
  const quickest = (n: StayNearbyPlace) => n.ways[0]?.minutes ?? 999;
  const sorted = [...nearby].sort((a, b) => quickest(a) - quickest(b));
  const hubs = sorted.filter(isHub);
  const sights = sorted.filter((n) => !isHub(n));
  const group = (label: string, list: StayNearbyPlace[], hub: boolean) => list.length > 0 && (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {list.map((n) => <NearbyRow key={n.name} place={n} hub={hub} />)}
      </ul>
    </div>
  );
  return (
    <section className="space-y-4">
      <div>
        <DetailSectionHeading>From the front door</DetailSectionHeading>
        <p className={cn(T.meta, "mt-1")}>How long it takes to reach what is close by.</p>
      </div>
      {group("Sights", sights, false)}
      {group("Stations and airports", hubs, true)}
    </section>
  );
}
