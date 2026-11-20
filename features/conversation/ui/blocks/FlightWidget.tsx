"use client";

import { FitText } from "@/components/FitText";
import React, { type ReactNode } from "react";
import { ArrowUpRight, Briefcase, Check, ChevronRight, Clock, Leaf, Moon, Shield } from "lucide-react";
import type { FlightOffer } from "@/components/TripPanelProvider";
import { cn } from "@/lib/utils";
import { AirlineMark } from "../panels/OtherFlights";
import { JourneyRail } from "../panels/JourneyRail";
import { formatDuration, offerRisks } from "@/lib/application/flight-risks";
import { arrivalDayOffset } from "./FlightFilters";
import { shortAirline } from "./flightCopy";
import { money, prettyDate, type } from "./ui";
import { WidgetPill } from "./Widget";

type Leg = NonNullable<FlightOffer["legs"]>[number];

export const offerKey = (o: FlightOffer) => o.id ?? `${o.airline}|${o.departAt}|${o.price}`;

/** The clock time of an ISO moment ("6:20 PM"); a dash when it can't be read, never blank space. */
function clockOf(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

export type FlightPick = { labels: string[]; offer: FlightOffer };

/**
 * The picks above the list: Best, Cheapest, Fastest. A single flight cannot be any of them, so it is "The only option".
 * When one fare wins two, the picks merge and the label says both: but a fare that is both Best and Cheapest is just "Cheapest".
 */
export function pickFares(items: FlightOffer[]): FlightPick[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ labels: ["The only option"], offer: items[0] }];
  const price = (o: FlightOffer) => Number(o.price) || Number.POSITIVE_INFINITY;
  const cheapest = items.reduce((a, b) => (price(b) < price(a) || (price(b) === price(a) && b.durationMinutes < a.durationMinutes) ? b : a));
  const fastest = items.reduce((a, b) => (b.durationMinutes < a.durationMinutes || (b.durationMinutes === a.durationMinutes && price(b) < price(a)) ? b : a));
  const minPrice = price(cheapest) || 1, minTime = fastest.durationMinutes || 1;
  // Best value: close to the lowest price and the shortest trip, with a small cost for every stop.
  const score = (o: FlightOffer) => price(o) / minPrice + 0.8 * (o.durationMinutes / minTime) + 0.15 * o.stops;
  const best = items.reduce((a, b) => (score(b) < score(a) ? b : a));
  const picks: FlightPick[] = [];
  for (const [label, offer] of [["Best", best], ["Cheapest", cheapest], ["Fastest", fastest]] as const) {
    const same = picks.find((p) => p.offer === offer);
    if (same) same.labels.push(label);
    else picks.push({ labels: [label], offer });
  }
  return picks.map((pick) => (pick.labels.includes("Cheapest") ? { ...pick, labels: pick.labels.filter((label) => label !== "Best") } : pick));
}

/** The legs of one fare, or one synthesised leg when the provider gave only the journey as a whole. */
function legsOf(offer: FlightOffer): Leg[] {
  if (offer.legs?.length) return offer.legs;
  return [{ from: offer.originAirport ?? "", departAt: offer.departAt, to: offer.destinationAirport ?? "", arriveAt: offer.arriveAt, minutes: offer.durationMinutes, airline: offer.airline, flightNumber: offer.flightNumbers?.slice(0, 2).join(" · "), aircraft: offer.aircraft, logo: offer.logo }];
}

/** White at the top, a warm wash at the foot where the fares overlap it: a daylight sky, not a dark slab. */
const DAY_SKY = "bg-[radial-gradient(90%_70%_at_50%_120%,oklch(0.64_0.175_36/0.13),transparent_72%),linear-gradient(180deg,#ffffff_0%,oklch(0.992_0.006_70)_62%,oklch(0.972_0.02_62)_100%)]";

/** The route by day: the two ends large and dark on white, a fine line arcing between them, the shortest time over it. */
export function FlightHero({ eyebrow, title, from, to, duration, dim = false, chip, right }: { eyebrow: ReactNode; title: ReactNode; from: { code: string; name: string }; to: { code: string; name: string }; duration: number; dim?: boolean; chip?: ReactNode; right?: ReactNode }) {
  const end = (e: { code: string; name: string }, align: "left" | "right") => (
    <div className={cn("absolute bottom-[3.5rem] min-w-0 max-w-[40%] text-ink", align === "left" ? "left-5 @[34rem]:left-[1.625rem]" : "right-5 text-right @[34rem]:right-[1.625rem]")}>
      <p className="font-display text-[2rem] leading-none font-light tracking-[-0.04em] @[34rem]:text-[2.5rem]">{e.code}</p>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">{e.name}</p>
    </div>
  );
  return (
    <div className={cn("relative h-[15rem] overflow-hidden", DAY_SKY)} role="group" aria-label={`${from.name} to ${to.name}`}>
      <svg viewBox="0 0 600 240" preserveAspectRatio="none" className={cn("absolute inset-0 size-full", dim && "opacity-35")} aria-hidden>
        <defs><linearGradient id="fw-arc" x1="0" x2="1"><stop offset="0" stopColor="#2a2420" stopOpacity="0.06" /><stop offset="0.5" stopColor="#2a2420" stopOpacity="0.5" /><stop offset="1" stopColor="#2a2420" stopOpacity="0.06" /></linearGradient></defs>
        <path d="M 36 184 Q 300 20 564 184" fill="none" stroke="url(#fw-arc)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The ends are plain elements, not part of the stretched drawing, so they stay round and in view at any width. */}
      <span aria-hidden className={cn("absolute bottom-[3.5rem] left-[6%] size-[7px] -translate-x-1/2 translate-y-1/2 rounded-full bg-ink", dim && "opacity-35")} />
      <span aria-hidden className={cn("absolute right-[6%] bottom-[3.5rem] size-[7px] translate-x-1/2 translate-y-1/2 rounded-full border border-ink/60 bg-white", dim && "opacity-35")} />
      <div className="absolute inset-x-5 top-5 flex items-start justify-between gap-3 text-ink @[34rem]:inset-x-[1.625rem]">
        <div className="min-w-0">
          <p className="eyebrow truncate text-muted-foreground!">{eyebrow}</p>
          <h3 className="mt-1 font-display text-2xl leading-[1.15] font-medium tracking-[-0.022em] text-balance @[34rem]:text-title">{title}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {chip}
          {right}
        </div>
      </div>
      {end(from, "left")}
      {end(to, "right")}
      {duration > 0 && <p className="absolute bottom-[5.25rem] left-1/2 -translate-x-1/2 text-center text-xs text-muted-foreground @max-[34rem]:hidden"><b className="font-display text-lg font-medium text-ink">{formatDuration(duration)}</b> shortest</p>}
    </div>
  );
}

/** Whole dollars: a tile or a row compares fares, so cents are noise; the sheet keeps the exact price. */
const wholeMoney = (o: FlightOffer) => money(Math.round(Number(o.price)), o.currency, true);

/**
 * The three picks (or two, or one) that overlap the hero's lower edge. On a phone a tile opens its sheet (the journey under the
 * picks is a desktop view, so a selected state would show nothing); on desktop it selects the flight the journey shows.
 */
export function FlightPicks({ picks, selected, onSelect, onOpen }: { picks: FlightPick[]; selected: string | null; onSelect: (key: string) => void; onOpen?: (offer: FlightOffer) => void }) {
  if (picks.length === 1 && picks[0].labels[0] === "The only option") {
    const o = picks[0].offer;
    return (
      <div className="relative z-[1] mx-4 -mt-10 @[34rem]:mx-5">
        <div className="flex items-center gap-3 rounded-2xl border-2 border-primary bg-primary px-4 py-3.5 text-primary-foreground shadow-lift">
          <AirlineMark offer={o} className="size-8" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-primary-foreground/70!">The only option</p>
            <p className={cn(type.meta, "truncate text-primary-foreground/70!")}>{o.airline} · {o.stops === 0 ? "nonstop" : `${o.stops} stop${o.stops > 1 ? "s" : ""}`} · {formatDuration(o.durationMinutes)}</p>
          </div>
          <FitText className="font-display text-2xl font-medium tracking-[-0.025em] tabular-nums">{wholeMoney(o)}</FitText>
        </div>
      </div>
    );
  }
  // One fare took every pick (it is both the cheapest and the fastest): one wide card instead of a tile three times too small for it.
  if (picks.length === 1 && picks[0].labels.length > 1) return <FlightPickBoth pick={picks[0]} on={selected === offerKey(picks[0].offer)} onSelect={onSelect} onOpen={onOpen} />;
  return (
    <div className="relative z-[1] mx-4 -mt-10 flex gap-2 @[34rem]:mx-5 max-lg:mx-[1.125rem] max-lg:mt-4">
      {picks.map((pick, i) => {
        const key = offerKey(pick.offer);
        const on = selected === key;
        const stops = pick.offer.stops === 0 ? "Nonstop" : `${pick.offer.stops} stop${pick.offer.stops > 1 ? "s" : ""}`;
        return (
          <button
            key={key}
            type="button"
            style={{ animationDelay: `${i * 70}ms` }}
            onClick={() => {
              onSelect(key);
              if (onOpen && window.matchMedia("(max-width: 1023.98px)").matches) onOpen(pick.offer);
            }}
            aria-pressed={on}
            className={cn("tile-in relative min-w-0 flex-1 rounded-2xl border border-border bg-surface p-3 text-left transition-[box-shadow,background-color,border-color,transform] duration-200 ease-out hover:border-ink/25 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:px-3.5", on && "lg:border-primary lg:bg-card lg:shadow-lift lg:ring-1 lg:ring-primary lg:backdrop-blur-md")}
          >
            <span className="flex items-center justify-between gap-1.5">
              <span className={cn("eyebrow status-dot inline-flex min-w-0 items-center gap-1.5 tracking-[0.06em]!", pick.labels[0] === "Cheapest" ? "status-ok" : pick.labels[0] === "Fastest" ? "status-info" : "status-brand")}><span className="truncate">{pick.labels.slice(0, picks.length <= 2 ? 2 : 1).join(" · ")}</span></span>
              <AirlineMark offer={pick.offer} className="size-6 max-lg:hidden" />
            </span>
            <FitText className="mt-1 font-display text-lg leading-[1.625rem] font-medium tracking-[-0.015em] tabular-nums lg:text-widget lg:leading-tight">{wholeMoney(pick.offer)}</FitText>
            <span className="mt-0.5 block truncate text-xs leading-[1.125rem] font-semibold">{shortAirline(pick.offer.airline)}</span>
            <span className={cn(type.meta, "block tabular-nums")}>{formatDuration(pick.offer.durationMinutes)}<br className="lg:hidden" /><span className="lg:before:content-['_·_']">{stops}</span></span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The fare that is both the cheapest and the fastest: the best row, promoted. A white card with the widget family's hairline and soft shadow.
 * Top: what it won, as two quiet labels with their status dots. Then the airline and the price, the largest thing on it. Under it, on the
 * `surface` well, the same timeline the rows carry, so the winner says as much as the fares below it. It opens the way a tile does.
 */
function FlightPickBoth({ pick, on, onSelect, onOpen }: { pick: FlightPick; on: boolean; onSelect: (key: string) => void; onOpen?: (offer: FlightOffer) => void }) {
  const o = pick.offer;
  const risks = offerRisks(o.legs);
  return (
    <div className="relative z-[1] mx-4 -mt-10 @[34rem]:mx-5 max-lg:mx-[1.125rem] max-lg:mt-4">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => {
          onSelect(offerKey(o));
          if (onOpen && window.matchMedia("(max-width: 1023.98px)").matches) onOpen(o);
        }}
        className={cn(
          "relative block w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card text-left shadow-soft",
          "transition-[box-shadow,border-color,transform] duration-200 ease-out hover:border-ink/25 hover:shadow-lift active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          on && "lg:border-primary lg:shadow-lift lg:ring-1 lg:ring-primary",
        )}
      >
        <span className="block p-4 @[34rem]:p-5">
          <span className="flex items-center justify-between gap-3">
            <span className="flex flex-wrap gap-x-3.5">
              {pick.labels.map((label) => (
                <span key={label} className={cn("eyebrow status-dot inline-flex items-center gap-1.5", label === "Cheapest" ? "status-ok" : label === "Fastest" ? "status-info" : "status-brand")}>{label}</span>
              ))}
            </span>
            {/* On a phone the card opens the fare's sheet, as the rows do; on desktop it selects the journey beside it, so no cue. */}
            {onOpen && <ChevronRight className="size-4 shrink-0 text-muted-foreground lg:hidden" aria-hidden />}
          </span>
          <span className="mt-3 flex items-center gap-3">
            <AirlineMark offer={o} className="size-9" />
            <span className="line-clamp-2 min-w-0 flex-1 text-body leading-[1.2] font-medium">{o.airline}</span>
            <span className="block max-w-[48%] shrink-0 text-right">
              <FitText className="font-display text-3xl leading-none font-medium tracking-[-0.03em] tabular-nums">{o.listedCurrency && <span className="mr-0.5 text-muted-foreground" title={`Converted from ${money(o.listedPrice ?? "", o.listedCurrency, true)} at today’s rate`}>≈</span>}{wholeMoney(o)}</FitText>
              <span className={cn(type.meta, "mt-1.5 block")}>per person</span>
            </span>
          </span>
        </span>
        <span className="block border-t border-border bg-surface px-4 py-3 @[34rem]:px-5">
          <FlightTimes offer={o} />
          {/* A connection worth knowing about, as the rows say it: one quiet saffron line each, never a banner. */}
          {risks.map((risk) => <span key={risk} className="mt-2.5 flex items-center gap-1.5 text-xs leading-[1.125rem] font-medium text-caution"><Clock className="size-3 shrink-0" aria-hidden />{risk}</span>)}
        </span>
      </button>
    </div>
  );
}

/** The same shapes as the picks, while a search is on its way. */
export function FlightPicksSkeleton() {
  return (
    <div aria-hidden className="relative z-[1] mx-4 -mt-10 flex gap-2.5 @[34rem]:mx-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="min-w-0 flex-1 rounded-2xl border border-border bg-surface px-3.5 py-3">
          <span className="block h-2.5 w-12 rounded bg-muted" />
          <span className="mt-2.5 block h-6 w-20 rounded-md bg-muted" />
          <span className="mt-2 block h-3 w-24 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * One fare opened out: the whole journey in order (each flight, each wait between them), then the price, the fare's
 * terms and what it costs the planet. Only what is known is drawn: no empty rows, no "N/A".
 */
export function FlightJourney({ offer, labels, roundTrip, onDetails, tripCurrency }: { offer: FlightOffer; labels: string[]; roundTrip: boolean; onDetails?: () => void; tripCurrency?: string }) {
  const legs = legsOf(offer);
  const plus = arrivalDayOffset(offer.departAt, offer.arriveAt);
  const hasLegDetail = Boolean(offer.legs?.length);
  const overnight = legs.some((l) => l.overnight);
  const terms: Array<{ icon: typeof Check; text: string; muted?: boolean }> = [];
  if (offer.baggage) terms.push({ icon: Briefcase, text: offer.baggage });
  for (const c of offer.fareConditions ?? []) terms.push({ icon: /not allowed/i.test(c) ? Shield : Check, text: c, muted: /not allowed/i.test(c) });
  if (offer.co2Kg) terms.push({ icon: Leaf, text: `${offer.co2Kg} kg CO₂${typeof offer.co2Diff === "number" && offer.co2Diff !== 0 ? `, ${Math.abs(offer.co2Diff)}% ${offer.co2Diff < 0 ? "lower" : "higher"} than typical` : ""}` });
  const converted = offer.listedCurrency && offer.listedCurrency !== offer.currency;
  const cabin = offer.cabinClass && !/^economy$/i.test(offer.cabinClass) ? offer.cabinClass : null;
  return (
    <div className="mx-4 mt-4 overflow-hidden rounded-3xl border border-border @[34rem]:mx-5" role="region" aria-label={`${offer.airline} journey`}>
      <div className="flex flex-col @[44rem]:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 @[34rem]:p-5">
          <div className="flex flex-wrap gap-2">
            {labels.map((l) => <WidgetPill key={l} tone={l === "Cheapest" ? "sage" : l === "Fastest" ? "lagoon" : "coral"}>{l}</WidgetPill>)}
            {cabin && <WidgetPill tone="lagoon">{cabin}</WidgetPill>}
            {offer.stops > 1 && <WidgetPill>{offer.stops} stops</WidgetPill>}
            {overnight && <WidgetPill icon={Moon} tone="lagoon">Overnight stop</WidgetPill>}
            {plus > 0 && <WidgetPill icon={Moon}>Arrives next day</WidgetPill>}
          </div>
          <JourneyRail legs={legs} />
          {!hasLegDetail && offer.stops > 0 && (
            <p className={cn(type.meta, "inline-flex items-center gap-1.5")}><Clock className="size-3.5 shrink-0" aria-hidden />{offer.stops} stop{offer.stops > 1 ? "s" : ""}{offer.layoverAirports?.length ? ` via ${offer.layoverAirports.join(", ")}` : ""}</p>
          )}
        </div>
        {/* Under the journey: the price and what the fare includes on the left, the button on the right, as tall as the content and no taller.
            Only a wide card puts it beside the journey as a column, centred so any spare height is shared above and below it. */}
        <div className="flex shrink-0 flex-col gap-4 border-t border-border bg-surface p-4 @[34rem]:flex-row @[34rem]:items-end @[34rem]:justify-between @[34rem]:p-5 @[44rem]:w-[15rem] @[44rem]:flex-col @[44rem]:items-stretch @[44rem]:justify-center @[44rem]:gap-5 @[44rem]:border-t-0 @[44rem]:border-l">
          <div className="min-w-0 space-y-3.5 @[34rem]:flex-1 @[44rem]:flex-none">
            <div>
              <p className="eyebrow">{roundTrip ? "Round trip · per person" : "Per person"}</p>
              <FitText className="mt-1.5 font-display text-4xl leading-none font-medium tracking-[-0.035em] tabular-nums">{converted && <span className="mr-1 text-xl text-muted-foreground" title={`Converted from ${money(offer.listedPrice ?? "", offer.listedCurrency ?? "", true)} at today’s rate`}>≈</span>}{money(offer.price, offer.currency, true)}</FitText>
              {converted && <p className={cn(type.meta, "mt-1")}>from {money(offer.listedPrice ?? "", offer.listedCurrency ?? "", true)}{tripCurrency ? ` · shown in ${tripCurrency}` : ""}</p>}
            </div>
            {terms.length > 0 ? (
              <ul className="space-y-2 border-t border-border pt-3.5">
                {terms.map((t) => (
                  <li key={t.text} className="flex items-start gap-2.5 text-sm leading-snug text-ink-soft">
                    <t.icon className={cn("mt-0.5 size-4 shrink-0", t.muted ? "text-muted-foreground" : "text-positive")} aria-hidden />
                    <span>{t.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={cn(type.meta, "border-t border-border pt-3.5")}>Fare rules are on the airline’s site.</p>
            )}
          </div>
          {onDetails && (
            <button type="button" onClick={onDetails} aria-label={`Details: ${offer.airline}, ${clockOf(offer.departAt)} to ${clockOf(offer.arriveAt)}`} className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16),0_1px_2px_oklch(0.2_0.012_65/0.22)] transition-[transform,filter] duration-200 hover:brightness-110 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {roundTrip && offer.departureToken ? "Choose your return" : "See this flight"} <ArrowUpRight className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The clock times with the route drawn between them: a dot for each stop, the duration over the line, the airports under it. One drawing for the row and for the winning fare. */
function FlightTimes({ offer, className }: { offer: FlightOffer; className?: string }) {
  const stops = offer.stops;
  const plus = arrivalDayOffset(offer.departAt, offer.arriveAt);
  // The airports a short trip changes at; with three or more stops the list would not fit, and the journey names them all.
  const via = offer.layoverAirports?.length && stops <= 2 ? true : false;
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <p className="font-display text-base font-medium tabular-nums whitespace-nowrap">{clockOf(offer.departAt)}</p>
      <div className="min-w-0 flex-1">
        <p className="text-center text-xs leading-[1.125rem] text-ink-soft tabular-nums">{[offer.durationMinutes > 0 ? formatDuration(offer.durationMinutes) : null, stops === 0 ? "nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}</p>
        <div className="relative my-1 h-2.5" aria-hidden>
          <span className="absolute inset-x-0 top-1 h-0.5 rounded-full bg-border" />
          <span className="absolute top-px left-0 size-2 rounded-full bg-foreground" />
          {Array.from({ length: Math.min(stops, 3) }, (_, k) => <span key={k} className="absolute top-[0.1875rem] size-1.5 -translate-x-1/2 rounded-full bg-coral" style={{ left: `${((k + 1) / (Math.min(stops, 3) + 1)) * 100}%` }} />)}
          <span className="absolute top-px right-0 size-2 rounded-full border-2 border-foreground bg-background" />
        </div>
        {(offer.originAirport || offer.destinationAirport) && (
          <p className="flex justify-between gap-2 text-xs leading-[1.125rem] tracking-[0.04em] text-muted-foreground"><span>{offer.originAirport}</span>{via && <span className="min-w-0 truncate tracking-normal">via {offer.layoverAirports?.join(", ")}</span>}<span>{offer.destinationAirport}</span></p>
        )}
      </div>
      <p className="font-display text-base font-medium tabular-nums whitespace-nowrap">{clockOf(offer.arriveAt)}{plus > 0 && <sup className="ml-0.5 text-2xs max-lg:text-xs text-coral-ink">+{plus}</sup>}</p>
    </div>
  );
}

/** One fare in the list: airline, the clock times with a timeline between, the price on the right. Risks sit under the airline in one saffron line each. */
export function FlightRowBody({ offer, cheapest, onDetails }: { offer: FlightOffer; cheapest: boolean; onDetails?: () => void }) {
  const risks = offerRisks(offer.legs);
  const cabin = offer.cabinClass && !/^economy$/i.test(offer.cabinClass) ? offer.cabinClass : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      {/* A fixed slot: one logo or two overlapping, the airline names start in the same place down the list. */}
      <span className="flex w-[3.75rem] shrink-0"><AirlineMark offer={offer} className="size-9 shrink-0" /></span>
      <div className="min-w-0 flex-1 @[34rem]:w-[7.25rem] @[34rem]:flex-none">
        <p className="line-clamp-2 text-body leading-[1.2] font-medium">{offer.airline}</p>
        {cheapest && <WidgetPill tone="sage" className="mt-0.5 h-5 text-2xs max-lg:text-xs">Cheapest</WidgetPill>}
        {cabin && <p className={cn(type.meta, "truncate")}>{cabin}</p>}
        {risks.map((risk) => <p key={risk} className="mt-0.5 flex items-center gap-1 text-xs leading-[1.125rem] font-medium text-caution"><Clock className="size-3 shrink-0" aria-hidden />{risk}</p>)}
      </div>
      <FlightTimes offer={offer} className="order-last w-full @[34rem]:order-none @[34rem]:w-auto @[34rem]:flex-1" />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <p className="font-display text-xl leading-tight font-medium tracking-[-0.015em] tabular-nums whitespace-nowrap">{offer.listedCurrency && <span className="mr-0.5 text-muted-foreground" title={`Converted from ${money(offer.listedPrice ?? "", offer.listedCurrency, true)} at today’s rate`}>≈</span>}{wholeMoney(offer)}</p>
        {onDetails && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
    </div>
  );
}
