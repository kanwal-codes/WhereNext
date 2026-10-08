"use client";

import React, { type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, BedDouble, Briefcase, Check, ChevronRight, Clock, Leaf, Moon, Plug, Shield, Tv, Wifi, Armchair } from "lucide-react";
import type { FlightOffer } from "@/components/TripPanelProvider";
import { cn } from "@/lib/utils";
import { AirlineMark } from "../panels/OtherFlights";
import { arrivalDayOffset } from "./FlightFilters";
import { money, prettyDate, type } from "./ui";
import { WidgetPill } from "./Widget";

type Leg = NonNullable<FlightOffer["legs"]>[number];

export const offerKey = (o: FlightOffer) => o.id ?? `${o.airline}|${o.departAt}|${o.price}`;

/** "7h 11m" from minutes. */
export const hoursMinutes = (minutes: number) => (minutes < 60 ? `${Math.round(minutes)}m` : `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, "0")}m`);

/** The clock time of an ISO moment ("6:20 PM"); a dash when it can't be read, never blank space. */
export function clockOf(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

export type FlightPick = { labels: string[]; offer: FlightOffer };

/**
 * The picks above the list: Best, Cheapest, Fastest. A single flight cannot be any of them, so it is "The only option".
 * When one fare wins two (Best and Cheapest are often the same), the picks merge and the label says both.
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
  return picks;
}

/** How a wait between two flights reads: an overnight stop, a connection that is too tight or very long, or just a wait. */
export function layoverNote(leg: Leg): { text: string; tone: "neutral" | "night" | "caution" } | null {
  const place = leg.toName ? `${leg.toName.replace(/\s+(international\s+)?airport$/i, "")} (${leg.to})` : leg.to;
  const minutes = leg.layoverMinutes;
  if (minutes === undefined) return { text: `Stop in ${place}`, tone: "neutral" };
  if (leg.overnight) return { text: `Overnight in ${place}, ${hoursMinutes(minutes)}`, tone: "night" };
  if (minutes < 45) return { text: `Only ${minutes} min in ${place} to change planes`, tone: "caution" };
  if (minutes >= 360) return { text: `${hoursMinutes(minutes)} layover in ${place}`, tone: "caution" };
  return { text: `${hoursMinutes(minutes)} layover in ${place}`, tone: "neutral" };
}

/** The legs of one fare, or one synthesised leg when the provider gave only the journey as a whole. */
function legsOf(offer: FlightOffer): Leg[] {
  if (offer.legs?.length) return offer.legs;
  return [{ from: offer.originAirport ?? "", departAt: offer.departAt, to: offer.destinationAirport ?? "", arriveAt: offer.arriveAt, minutes: offer.durationMinutes, airline: offer.airline, flightNumber: offer.flightNumbers?.slice(0, 2).join(" · "), aircraft: offer.aircraft, logo: offer.logo }];
}

const NIGHT_SKY = "bg-[radial-gradient(90%_70%_at_50%_118%,oklch(0.64_0.175_36/0.55),transparent_74%),linear-gradient(180deg,#120f0e_0%,#1a1513_58%,#2a1d17_100%)]";
/** A little film grain, so the dark reads as a surface and not a flat fill. */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")}")`;

/** The route at dusk: the two ends large and light, a fine line arcing between them, the shortest time over it. */
export function FlightHero({ eyebrow, title, from, to, duration, dim = false, chip, right }: { eyebrow: ReactNode; title: ReactNode; from: { code: string; name: string }; to: { code: string; name: string }; duration: number; dim?: boolean; chip?: ReactNode; right?: ReactNode }) {
  const end = (e: { code: string; name: string }, align: "left" | "right") => (
    <div className={cn("absolute bottom-[3.5rem] min-w-0 max-w-[40%] text-white", align === "left" ? "left-5 @[34rem]:left-[1.625rem]" : "right-5 text-right @[34rem]:right-[1.625rem]")}>
      <p className="font-display text-[2rem] leading-none font-light tracking-[-0.04em] @[34rem]:text-[2.75rem]">{e.code}</p>
      <p className="mt-1.5 truncate text-[0.8125rem] text-white/70">{e.name}</p>
    </div>
  );
  return (
    <div className={cn("relative h-[15rem] overflow-hidden", NIGHT_SKY)} role="group" aria-label={`${from.name} to ${to.name}`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      <svg viewBox="0 0 600 240" preserveAspectRatio="none" className={cn("absolute inset-0 size-full", dim && "opacity-35")} aria-hidden>
        <defs><linearGradient id="fw-arc" x1="0" x2="1"><stop offset="0" stopColor="white" stopOpacity="0.05" /><stop offset="0.5" stopColor="white" stopOpacity="0.7" /><stop offset="1" stopColor="white" stopOpacity="0.05" /></linearGradient></defs>
        <path d="M 36 184 Q 300 20 564 184" fill="none" stroke="url(#fw-arc)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The ends are plain elements, not part of the stretched drawing, so they stay round and in view at any width. */}
      <span aria-hidden className={cn("absolute bottom-[3.5rem] left-[6%] size-[7px] -translate-x-1/2 translate-y-1/2 rounded-full bg-white", dim && "opacity-35")} />
      <span aria-hidden className={cn("absolute right-[6%] bottom-[3.5rem] size-[7px] translate-x-1/2 translate-y-1/2 rounded-full border border-white/70", dim && "opacity-35")} />
      <div className="absolute inset-x-5 top-5 flex items-start justify-between gap-3 text-white @[34rem]:inset-x-[1.625rem]">
        <div className="min-w-0">
          <p className="eyebrow truncate text-white/70!">{eyebrow}</p>
          <h3 className="mt-1 font-display text-[1.5rem] leading-[1.15] font-medium tracking-[-0.022em] text-balance @[34rem]:text-[1.75rem]">{title}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {chip}
          {right}
        </div>
      </div>
      {end(from, "left")}
      {end(to, "right")}
      {duration > 0 && <p className="absolute bottom-[5.25rem] left-1/2 -translate-x-1/2 text-center text-[0.8125rem] text-white/65 @max-[34rem]:hidden"><b className="font-display text-[1.0625rem] font-medium text-white">{hoursMinutes(duration)}</b> shortest</p>}
    </div>
  );
}

/** The three picks (or two, or one) that overlap the hero's lower edge. */
export function FlightPicks({ picks, selected, onSelect, roundTrip }: { picks: FlightPick[]; selected: string | null; onSelect: (key: string) => void; roundTrip: boolean }) {
  if (picks.length === 1 && picks[0].labels[0] === "The only option") {
    const o = picks[0].offer;
    return (
      <div className="relative z-[1] mx-4 -mt-10 @[34rem]:mx-5">
        <div className="flex items-center gap-3 rounded-[1.25rem] border-2 border-coral bg-card px-4 py-3.5 shadow-lift">
          <AirlineMark offer={o} className="size-8" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-coral-ink!">The only option</p>
            <p className={cn(type.meta, "truncate")}>{o.airline} · {o.stops === 0 ? "nonstop" : `${o.stops} stop${o.stops > 1 ? "s" : ""}`} · {hoursMinutes(o.durationMinutes)}</p>
          </div>
          <p className="font-display text-2xl font-medium tracking-[-0.025em] tabular-nums">{money(o.price, o.currency, true)}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="relative z-[1] mx-4 -mt-10 flex gap-2.5 @[34rem]:mx-5">
      {picks.map((pick) => {
        const key = offerKey(pick.offer);
        const on = selected === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-pressed={on}
            className={cn("min-w-0 flex-1 rounded-[1.25rem] px-3.5 py-3 text-left backdrop-blur-md transition-[box-shadow,background-color,transform] duration-200 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", on ? "border-2 border-coral bg-card shadow-lift" : "border border-white/80 bg-card/75 shadow-soft hover:bg-card/90")}
          >
            <span className="flex items-center justify-between gap-1.5">
              <span className={cn("eyebrow truncate", on && "text-coral-ink!")}>{pick.labels.join(" · ")}</span>
              <AirlineMark offer={pick.offer} className="size-6" />
            </span>
            <span className="mt-1.5 block font-display text-[1.375rem] leading-tight font-medium tracking-[-0.025em] tabular-nums">{money(pick.offer.price, pick.offer.currency, true)}</span>
            <span className={cn(type.meta, "block truncate")}>{hoursMinutes(pick.offer.durationMinutes)} · {pick.offer.stops === 0 ? "nonstop" : `${pick.offer.stops} stop${pick.offer.stops > 1 ? "s" : ""}`}{roundTrip ? " · round trip" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The same shapes as the picks, while a search is on its way. */
export function FlightPicksSkeleton() {
  return (
    <div aria-hidden className="relative z-[1] mx-4 -mt-10 flex gap-2.5 @[34rem]:mx-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="min-w-0 flex-1 rounded-[1.25rem] border border-white/80 bg-card/80 px-3.5 py-3">
          <span className="block h-2.5 w-12 rounded bg-muted" />
          <span className="mt-2.5 block h-6 w-20 rounded-md bg-muted" />
          <span className="mt-2 block h-3 w-24 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** The comforts of a flight read as quiet marks on one line, not as bordered chips that each take a row in a narrow card. */
const MARK = "inline-flex items-center gap-1 whitespace-nowrap text-xs text-ink-soft";
const AMENITY_ICON = (text: string) => (/wi-?fi/i.test(text) ? Wifi : /power|usb|outlet/i.test(text) ? Plug : /video|entertain|stream|screen/i.test(text) ? Tv : Check);

/** One flight of the journey: airline, number, aircraft, time in the air, and only the comforts it actually has. */
function LegBlock({ leg, fallbackAirline, compact = false }: { leg: Leg; fallbackAirline: string; compact?: boolean }) {
  // On a journey of three or more flights each box slims down: the comforts of every flight would bury the journey, so only the
  // legroom and a warning (a flight that is often late) stay; the full list is one tap away on the flight's details.
  const amenities = compact ? [] : (leg.amenities ?? []);
  const shown = amenities.slice(0, 3);
  const detail = [leg.aircraft, hoursMinutes(leg.minutes)].filter(Boolean).join(" · ");
  return (
    <div className="flex gap-3.5">
      <span className="w-3.5 shrink-0" aria-hidden />
      {/* The logo and the airline share a row; everything else gets the box's full width beneath, so nothing is cut short. */}
      <div className={cn("min-w-0 flex-1 rounded-[1.25rem] bg-surface", compact ? "p-3" : "p-3.5")}>
        <div className="flex items-center gap-3">
          <AirlineMark offer={{ airline: leg.airline ?? fallbackAirline, logo: leg.logo }} className={cn("shrink-0", compact ? "size-8" : "size-9")} />
          <p className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{leg.airline ?? fallbackAirline}{leg.flightNumber && <span className="ml-1.5 font-normal text-muted-foreground">{leg.flightNumber}</span>}</p>
        </div>
        {detail && <p className={cn(type.meta, "mt-2")}>{detail}</p>}
        {(shown.length > 0 || leg.legroom || leg.oftenDelayed) && (
          <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5">
            {shown.map((a) => { const Icon = AMENITY_ICON(a); return <span key={a} className={MARK}><Icon className="size-3.5 shrink-0" aria-hidden />{a}</span>; })}
            {amenities.length > shown.length && <span className={MARK}>+{amenities.length - shown.length} more</span>}
            {leg.legroom && <span className={MARK}><Armchair className="size-3.5 shrink-0" aria-hidden />{leg.legroom} legroom</span>}
            {leg.oftenDelayed && <span className={cn(MARK, "font-medium text-caution")}><AlertTriangle className="size-3.5 shrink-0" aria-hidden />Often delayed 30+ min</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function Node({ time, code, name, note, end, plus }: { time: string; code?: string; name?: string; note?: string; end?: boolean; plus?: number }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="flex w-3.5 shrink-0 justify-center self-start pt-2" aria-hidden><span className={cn("size-3.5 rounded-full", end ? "border-[3px] border-foreground bg-background" : "bg-foreground")} /></span>
      <p className="w-[6.5rem] shrink-0 font-display text-2xl leading-tight font-medium tracking-[-0.02em] tabular-nums">{time}{plus ? <sup className="ml-0.5 text-[0.6875rem] text-coral">+{plus}</sup> : null}</p>
      <div className="min-w-0">
        <p className="truncate text-[0.9375rem] font-semibold">{code}{name && <span className="font-normal text-muted-foreground"> · {name}</span>}</p>
        {note && <p className={cn(type.meta)}>{note}</p>}
      </div>
    </div>
  );
}

const WAIT_TONE = { neutral: "bg-surface text-ink-soft border border-border", night: "bg-lagoon-soft text-lagoon", caution: "bg-caution-soft text-caution" } as const;

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
    <div className="mx-4 mt-4 overflow-hidden rounded-[1.5rem] border border-border @[34rem]:mx-5" role="region" aria-label={`${offer.airline} journey`}>
      <div className="flex flex-col @[44rem]:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 @[34rem]:p-5">
          <div className="flex flex-wrap gap-2">
            {labels.map((l) => <WidgetPill key={l} tone={l === "Cheapest" ? "sage" : l === "Fastest" ? "lagoon" : "coral"}>{l}</WidgetPill>)}
            {cabin && <WidgetPill tone="lagoon">{cabin}</WidgetPill>}
            {offer.stops > 1 && <WidgetPill>{offer.stops} stops</WidgetPill>}
            {overnight && <WidgetPill icon={Moon} tone="lagoon">Overnight stop</WidgetPill>}
            {plus > 0 && <WidgetPill icon={Moon}>Arrives next day</WidgetPill>}
          </div>
          <Node time={clockOf(legs[0]?.departAt ?? offer.departAt)} code={legs[0]?.from || offer.originAirport} name={legs[0]?.fromName} note={prettyDate(offer.departAt.slice(0, 10))} />
          {legs.map((leg, i) => {
            const wait = i < legs.length - 1 ? layoverNote(leg) : null;
            return (
              <React.Fragment key={i}>
                {hasLegDetail || legs.length === 1 ? <LegBlock leg={leg} fallbackAirline={offer.airline} compact={legs.length >= 3} /> : null}
                {wait && (
                  <div className="flex items-center gap-4">
                    <span className="flex w-3.5 shrink-0 justify-center" aria-hidden><span className="h-8 w-0.5 bg-[repeating-linear-gradient(to_bottom,var(--border)_0_4px,transparent_4px_8px)]" /></span>
                    <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", WAIT_TONE[wait.tone])}>
                      {wait.tone === "night" ? <BedDouble className="size-3.5 shrink-0" aria-hidden /> : wait.tone === "caution" ? <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> : <Clock className="size-3.5 shrink-0" aria-hidden />}
                      {wait.text}
                    </span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
          {!hasLegDetail && offer.stops > 0 && (
            <div className="flex items-center gap-4">
              <span className="flex w-3.5 shrink-0 justify-center" aria-hidden><span className="h-8 w-0.5 bg-[repeating-linear-gradient(to_bottom,var(--border)_0_4px,transparent_4px_8px)]" /></span>
              <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", WAIT_TONE.neutral)}><Clock className="size-3.5 shrink-0" aria-hidden />{offer.stops} stop{offer.stops > 1 ? "s" : ""}{offer.layoverAirports?.length ? ` via ${offer.layoverAirports.join(", ")}` : ""}</span>
            </div>
          )}
          <Node end time={clockOf(legs[legs.length - 1]?.arriveAt ?? offer.arriveAt)} code={legs[legs.length - 1]?.to || offer.destinationAirport} name={legs[legs.length - 1]?.toName} note={prettyDate(offer.arriveAt.slice(0, 10))} plus={plus} />
        </div>
        {/* Under the journey: the price and what the fare includes on the left, the button on the right, as tall as the content and no taller.
            Only a wide card puts it beside the journey as a column, centred so any spare height is shared above and below it. */}
        <div className="flex shrink-0 flex-col gap-4 border-t border-border bg-surface p-4 @[34rem]:flex-row @[34rem]:items-end @[34rem]:justify-between @[34rem]:p-5 @[44rem]:w-[15rem] @[44rem]:flex-col @[44rem]:items-stretch @[44rem]:justify-center @[44rem]:gap-5 @[44rem]:border-t-0 @[44rem]:border-l">
          <div className="min-w-0 space-y-3.5 @[34rem]:flex-1 @[44rem]:flex-none">
            <div>
              <p className="eyebrow">{roundTrip ? "Round trip · per person" : "Per person"}</p>
              <p className="mt-1.5 font-display text-[2.25rem] leading-none font-medium tracking-[-0.035em] tabular-nums">{converted && <span className="mr-1 text-xl text-muted-foreground" title={`Converted from ${money(offer.listedPrice ?? "", offer.listedCurrency ?? "", true)} at today’s rate`}>≈</span>}{money(offer.price, offer.currency, true)}</p>
              {converted && <p className={cn(type.meta, "mt-1")}>from {money(offer.listedPrice ?? "", offer.listedCurrency ?? "", true)}{tripCurrency ? ` · shown in ${tripCurrency}` : ""}</p>}
            </div>
            {terms.length > 0 ? (
              <ul className="space-y-2 border-t border-border pt-3.5">
                {terms.map((t) => (
                  <li key={t.text} className="flex items-start gap-2.5 text-[0.84375rem] leading-snug text-ink-soft">
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
            <button type="button" onClick={onDetails} aria-label={`Details: ${offer.airline}, ${clockOf(offer.departAt)} to ${clockOf(offer.arriveAt)}`} className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16),0_1px_2px_oklch(0.2_0.012_65/0.3)] transition-[transform,filter] duration-200 hover:brightness-110 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {roundTrip && offer.departureToken ? "Choose your return" : "See this flight"} <ArrowUpRight className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** One fare in the list: airline (two lines at most), the clock times with a timeline between, the price on the right. */
export function FlightRowBody({ offer, roundTrip, cheapest, selected, onDetails }: { offer: FlightOffer; roundTrip: boolean; cheapest: boolean; selected?: boolean; onDetails?: () => void }) {
  const stops = offer.stops;
  const plus = arrivalDayOffset(offer.departAt, offer.arriveAt);
  // The airports a short trip changes at; with three or more stops the list would not fit, and the journey card names them all.
  const via = offer.layoverAirports?.length && stops <= 2 ? ` · ${offer.layoverAirports.join(", ")}` : "";
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <AirlineMark offer={offer} className="size-9 shrink-0" />
      <div className="min-w-0 flex-1 @[34rem]:w-[7.25rem] @[34rem]:flex-none">
        <p className="line-clamp-2 text-[0.9375rem] leading-[1.2] font-medium">{offer.airline}</p>
        {cheapest ? <WidgetPill tone="sage" className="mt-0.5 h-5 text-[0.6875rem]">Cheapest</WidgetPill> : <p className={cn(type.meta, "truncate")}>{[offer.cabinClass, offer.flightNumbers?.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || offer.originAirport}</p>}
      </div>
      <div className="order-last flex w-full min-w-0 items-center gap-3 @[34rem]:order-none @[34rem]:w-auto @[34rem]:flex-1">
        <p className="font-display text-base font-medium tabular-nums whitespace-nowrap">{clockOf(offer.departAt)}</p>
        <div className="min-w-0 flex-1">
          <p className="flex justify-between gap-2 text-xs text-ink-soft tabular-nums"><span className="whitespace-nowrap">{offer.durationMinutes > 0 ? hoursMinutes(offer.durationMinutes) : ""}</span><span className="truncate">{stops === 0 ? "nonstop" : `${stops} stop${stops > 1 ? "s" : ""}${via}`}</span></p>
          <div className="relative my-1 h-2.5" aria-hidden>
            <span className="absolute inset-x-0 top-1 h-0.5 rounded-full bg-border" />
            <span className="absolute top-px left-0 size-2 rounded-full bg-foreground" />
            {Array.from({ length: Math.min(stops, 3) }, (_, k) => <span key={k} className="absolute top-[0.1875rem] size-1.5 -translate-x-1/2 rounded-full bg-coral" style={{ left: `${((k + 1) / (Math.min(stops, 3) + 1)) * 100}%` }} />)}
            <span className="absolute top-px right-0 size-2 rounded-full border-2 border-foreground bg-background" />
          </div>
        </div>
        <p className="font-display text-base font-medium tabular-nums whitespace-nowrap">{clockOf(offer.arriveAt)}{plus > 0 && <sup className="ml-0.5 text-[0.625rem] text-coral">+{plus}</sup>}</p>
      </div>
      <div className="ml-auto flex shrink-0 flex-col items-end">
        <p className="font-display text-xl leading-tight font-medium tracking-[-0.015em] tabular-nums whitespace-nowrap">{offer.listedCurrency && <span className="mr-0.5 text-muted-foreground" title={`Converted from ${money(offer.listedPrice ?? "", offer.listedCurrency, true)} at today’s rate`}>≈</span>}{money(offer.price, offer.currency, true)}</p>
        <p className="text-[0.71875rem] text-muted-foreground">{roundTrip ? "round trip" : "per person"}</p>
        {onDetails && <span className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-ink-soft" aria-hidden>{selected ? "Shown above" : "Details"}<ChevronRight className="size-3.5" /></span>}
      </div>
    </div>
  );
}
