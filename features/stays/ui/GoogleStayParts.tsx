"use client";

import { hotelPhotoSrc } from "@/lib/hotel-photo";
import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Bus, Car, Check, Footprints, MapPin, Minus, Plane, TrainFront, TrendingDown, TrendingUp } from "lucide-react";
import { Fold } from "@/components/Fold";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import type { useStayDetails } from "@/features/stays/application/useStayDetails";
import { Badge, Notice, RatingMeta, money, prettyDate, type as T } from "@/features/conversation/ui/blocks/ui";
import { cn, safeHref } from "@/lib/utils";
import type { StayNearbyPlace, StayTheme } from "@/packages/contracts/stay";

type Details = ReturnType<typeof useStayDetails>;

/** Google's read on this hotel's price for the dates, drawn as a gauge: the band it usually costs, and where this price sits in it. */
function PriceGauge({ s }: { s: Details }) {
  const r = s.priceRead;
  const here = s.sources[0]?.nightly;
  if (!r || here === undefined) return null;
  const lo = Math.min(r.typicalLow, here) * 0.88;
  const hi = Math.max(r.typicalHigh, here) * 1.08;
  const at = (n: number) => `${Math.min(100, Math.max(0, ((n - lo) / (hi - lo)) * 100))}%`;
  const tone = {
    low: { Icon: TrendingDown, text: "A low price for this hotel", cls: "text-positive", dot: "bg-positive" },
    typical: { Icon: Minus, text: "A typical price for this hotel", cls: "text-ink-soft", dot: "bg-foreground" },
    high: { Icon: TrendingUp, text: "Higher than usual for this hotel", cls: "text-caution", dot: "bg-caution" },
  }[r.level];
  return (
    <div role="note" className="space-y-2.5">
      <p className={cn("flex items-center gap-2 text-sm font-medium", tone.cls)}>
        <tone.Icon className="size-4 shrink-0" aria-hidden />
        {tone.text}
      </p>
      <div className="relative h-1.5 rounded-full bg-muted" aria-hidden>
        <span className="absolute inset-y-0 rounded-full bg-foreground/10" style={{ left: at(r.typicalLow), right: `calc(100% - ${at(r.typicalHigh)})` }} />
        <span className={cn("absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-card", tone.dot)} style={{ left: at(here) }} />
      </div>
      <p className={cn(T.meta, "tabular-nums")}>Usually {money(r.typicalLow, r.currency, true)} to {money(r.typicalHigh, r.currency, true)} a night</p>
    </div>
  );
}

/** Where a hotel is sold for the dates: the best price set large with the way to book it, then every other site quietly beneath. */
export function WhereToBook({ s, hotelId }: { s: Details; hotelId: string }) {
  const reduce = useReducedMotion();
  const locked = s.lockedStay && s.lockedStay.hotelId === hotelId ? s.lockedStay : null;
  const dates = s.checkin && s.checkout ? `${prettyDate(s.checkin)} – ${prettyDate(s.checkout)}` : null;
  const [best, ...others] = s.sources;
  const bestHref = best ? safeHref(best.link) : null;
  const siteMark = (src: (typeof s.sources)[number], size: string) => (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-black/10", size)}>
      {src.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a site's own logo from Google Hotels
        <img src={hotelPhotoSrc(src.logo)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-[70%] object-contain" />
      ) : (
        <span aria-hidden className="text-xs font-semibold text-muted-foreground">{src.source.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
  return (
    <section aria-labelledby="stay-book" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <DetailSectionHeading id="stay-book">Where to book</DetailSectionHeading>
        {dates && <p className={cn(T.meta, "tabular-nums")}>{dates}{s.nights ? ` · ${s.nights} night${s.nights === 1 ? "" : "s"}` : ""}</p>}
      </div>
      {s.assumedDates && <Notice tone="caution">These are example dates. Set your real dates to see accurate prices.</Notice>}
      {!best ? (
        <Notice>No prices came back for these dates. The hotel may be full, or try different dates.</Notice>
      ) : (
        <>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-soft"
          >
            <div className="relative p-5">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-coral/[0.07] to-transparent" />
            <div className="relative flex items-center gap-3">
              {siteMark(best, "size-10")}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{best.source}</p>
                <p className={T.meta}>{best.official ? "The hotel's own site" : "Best price for your dates"}</p>
              </div>
              {others.length > 0 && <Badge tone="positive" icon={Check}>Lowest price</Badge>}
            </div>
            <div className="relative mt-5 flex items-baseline gap-2">
              <span className="font-display text-4xl font-semibold leading-none tabular-nums tracking-[-0.03em]">{money(best.nightly, s.currency, true)}</span>
              <span className="text-sm text-muted-foreground">a night</span>
            </div>
            <p className={cn(T.meta, "relative mt-2 tabular-nums")}>
              {money(best.total, s.currency, true)} for {s.nights} night{s.nights === 1 ? "" : "s"}{best.totalBeforeTaxes ? ` · ${money(best.totalBeforeTaxes, s.currency, true)} before taxes` : ""}
            </p>
            {best.freeCancellation && (
              <p className="relative mt-3 flex items-center gap-1.5 text-sm text-positive">
                <Check className="size-4" aria-hidden />Free cancellation{best.cancelUntil ? ` until ${best.cancelUntil}` : ""}
              </p>
            )}
            {s.priceRead && <div className="relative mt-5 border-t border-border pt-4"><PriceGauge s={s} /></div>}
            {bestHref && (
              <a
                href={bestHref}
                target="_blank"
                rel="noopener noreferrer"
                className="relative mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lift transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]"
              >
                Book on {best.source} <ArrowUpRight className="size-4" aria-hidden />
              </a>
            )}
            </div>
          {others.length > 0 && (
              <Fold variant="strip" label="Also available" count={others.length} defaultOpen={s.sources.length <= 4} hint={`${others.slice(0, 3).map((o) => o.source).join(", ")}${others.length > 3 ? ` +${others.length - 3}` : ""}`}>
              <ul className="divide-y divide-border border-t border-border bg-card">
                {others.map((src, i) => {
                  const href = safeHref(src.link);
                  const extra = src.nightly - best.nightly;
                  const row = (
                    <>
                      {siteMark(src, "size-9")}
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                          {src.source}
                          {src.official && <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-ink-soft">Official site</span>}
                        </p>
                        <p className={cn(T.meta, "tabular-nums", src.freeCancellation && "text-positive")}>
                          {src.freeCancellation ? `Free cancellation${src.cancelUntil ? ` until ${src.cancelUntil}` : ""}` : `${money(src.total, s.currency, true)} total`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-base font-semibold tabular-nums">{money(src.nightly, s.currency, true)}</p>
                        <p className={cn(T.meta, "tabular-nums")}>{extra > 0 ? `+${money(extra, s.currency, true)}` : "a night"}</p>
                      </div>
                      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                    </>
                  );
                  return (
                    <motion.li key={src.source} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.1 + Math.min(i, 6) * 0.04 }}>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Book on ${src.source} (opens their site)`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">{row}</a>
                      ) : (
                        <div className="flex items-center gap-3 px-4 py-3">{row}</div>
                      )}
                    </motion.li>
                  );
                })}
              </ul>
              </Fold>
          )}

          </motion.div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {locked ? (
              <Badge tone="positive" icon={Check}>Your stay</Badge>
            ) : (
              <button type="button" className="btn-primary-sm" disabled={s.busy} onClick={() => void s.lockSource(best)}>
                {s.busy ? "Saving…" : "Make this my stay"}
              </button>
            )}
            <p className={cn(T.meta, "max-w-[28ch] text-right")}>You book on the site you pick. Prices and availability change.</p>
          </div>
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
        <img src={hotelPhotoSrc(place.thumbnail)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-12 shrink-0 rounded-xl border border-border object-cover" />
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
  const list = (items: StayNearbyPlace[], hub: boolean) => (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      {items.map((n) => <NearbyRow key={n.name} place={n} hub={hub} />)}
    </ul>
  );
  return (
    <section className="space-y-4">
      <div>
        <DetailSectionHeading>From the front door</DetailSectionHeading>
        <p className={cn(T.meta, "mt-1")}>How long it takes to get in and out, and to reach what is close by.</p>
      </div>
      {/* Getting in and out is what only this list knows, so it leads. */}
      {hubs.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Stations and airports</p>
          {list(hubs, true)}
        </div>
      )}
      {/* "Around here" below is the better guide to what to do (photos, ratings, saving); this is the same places by distance, so it folds. */}
      {sights.length > 0 && (
        <Fold label="Sights by distance" count={sights.length} hint={sights.slice(0, 2).map((n) => n.name).join(", ")}>
          {list(sights, false)}
        </Fold>
      )}
    </section>
  );
}
