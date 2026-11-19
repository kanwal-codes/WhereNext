"use client";

import React, { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, Clock, Moon, Plane, Plug, Tv, Wifi } from "lucide-react";
import type { FlightOffer } from "@/components/TripPanelProvider";
import { arrivalDayOffset } from "@/features/conversation/ui/blocks/FlightFilters";
import { boardItem } from "@/features/conversation/ui/blocks/flightCopy";
import { prettyDate, type } from "@/features/conversation/ui/blocks/ui";
import { formatDuration, layoverRisk } from "@/lib/application/flight-risks";
import { cn } from "@/lib/utils";
import { AirlineMark } from "./OtherFlights";

type FullLeg = NonNullable<FlightOffer["legs"]>[number];
/** A leg as the rail needs it. Times and length are missing for a card saved before the journey was kept. */
export type RailLeg = Omit<FullLeg, "departAt" | "arriveAt" | "minutes"> & { departAt?: string; arriveAt?: string; minutes?: number };

export const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
};
const dayOf = (iso: string) => prettyDate(iso.slice(0, 10)) ?? "";
const airportName = (name?: string) => name?.replace(/\s+(International\s+)?Airport$/i, "");

type Station = { code: string; name?: string; arrive?: string; depart?: string; wait?: number; overnight?: boolean };

const BOARD_ICON = { wifi: Wifi, power: Plug, video: Tv, other: Plane } as const;

/** One flight's detail, opened on request: only what describes the flight, never what decides between flights. */
function LegDetail({ leg }: { leg: RailLeg }) {
  const board = (leg.amenities ?? []).map(boardItem);
  return (
    <dl className="mb-2 grid gap-1 rounded-xl bg-surface px-3 py-2 text-xs leading-[1.125rem] text-ink-soft">
      {leg.aircraft && <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted-foreground">Aircraft</dt><dd className="font-medium text-foreground">{leg.aircraft}</dd></div>}
      {leg.legroom && <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted-foreground">Legroom</dt><dd className="font-medium text-foreground">{leg.legroom}</dd></div>}
      {board.length > 0 && (
        <div>
          <dt className="text-muted-foreground">On board</dt>
          <dd className="mt-1">
            <ul className="grid gap-1">
              {board.map((b) => { const Icon = BOARD_ICON[b.icon]; return <li key={b.text} className="flex items-center gap-2 font-medium text-foreground"><Icon className="size-3.5 shrink-0 text-coral" aria-hidden />{b.text}</li>; })}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  );
}

const hasDetail = (leg: RailLeg) => Boolean(leg.aircraft || leg.legroom || leg.amenities?.length);

/**
 * The journey as a time column, a rail and one block per airport, with each flight as the connector between them.
 * Arrival sits over departure at a connection, the flight's length fills the column beside it, a dashed coral rail runs
 * through a layover, and the flight row opens (tap or click, never hover) to its aircraft, legroom and what is on board.
 * Only what the provider gave is drawn: a card saved before the legs were kept shows its airports without times.
 */
export function JourneyRail({ legs, showDates = true }: { legs: RailLeg[]; showDates?: boolean }) {
  const reduce = useReducedMotion();
  const id = useId();
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const first = legs[0]!;
  const last = legs[legs.length - 1]!;
  const stations: Station[] = [
    { code: first.from, name: first.fromName, depart: first.departAt },
    ...legs.slice(1).map((l, i): Station => ({ code: l.from, name: legs[i]!.toName, arrive: legs[i]!.arriveAt, depart: l.departAt, wait: legs[i]!.layoverMinutes, overnight: legs[i]!.overnight })),
    { code: last.to, name: last.toName, arrive: last.arriveAt },
  ];
  const waits = legs.reduce((sum, l) => sum + (l.layoverMinutes ?? 0), 0);
  const plus = (iso?: string) => (iso && first.departAt ? arrivalDayOffset(first.departAt, iso) : 0);
  const toggle = (i: number) => setOpen((prev) => { const next = new Set(prev); if (!next.delete(i)) next.add(i); return next; });

  const time = (iso?: string, withPlus = false) => iso ? <>{clock(iso)}{withPlus && plus(iso) > 0 && <sup className="text-xs font-semibold text-coral-ink">+{plus(iso)}</sup>}</> : <span className="text-muted-foreground">–</span>;

  return (
    <div>
      {legs.length > 1 && <p className={cn(type.meta, "mb-3")}>{legs.length} flights{waits > 0 ? `, ${formatDuration(waits)} of layover` : ""}</p>}
      <ol>
        {stations.map((st, i) => {
          const isFirst = i === 0;
          const isLast = i === stations.length - 1;
          const connection = !isFirst && !isLast;
          const risk = connection && st.wait !== undefined ? layoverRisk({ layoverMinutes: st.wait, overnight: st.overnight }) : null;
          const leg = legs[i];
          const timed = Boolean(leg?.minutes);
          const expandable = !isLast && leg && timed && hasDetail(leg);
          const isOpen = open.has(i);
          const panelId = `${id}-leg-${i}`;
          const dateIso = isFirst ? st.depart : isLast ? st.arrive : undefined;
          return (
            <React.Fragment key={i}>
              <li className="grid grid-cols-[4rem_1rem_minmax(0,1fr)] gap-x-2">
                <div className="flex flex-col justify-between text-right font-display text-sm leading-[1.3125rem] font-medium tabular-nums whitespace-nowrap">
                  <span>{time(isFirst ? st.depart : st.arrive, !isFirst)}</span>
                  {connection && st.depart && <span className="text-ink-soft">{clock(st.depart)}</span>}
                </div>
                <div className="relative" aria-hidden>
                  <span className={cn("absolute left-[7px] w-0 border-l-2", isFirst ? "top-[11px] bottom-0" : isLast ? "top-0 h-[11px]" : "inset-y-0", connection && st.wait ? "border-dashed border-coral/55" : "border-input")} />
                  <span className={cn("absolute left-[3px] top-1.5 size-2.5 rounded-full bg-background", isLast ? "bg-foreground" : connection ? "shadow-[inset_0_0_0_2px_var(--coral)]" : "shadow-[inset_0_0_0_2px_var(--foreground)]")} />
                </div>
                <div className="min-w-0 pb-2">
                  {(airportName(st.name) || st.code) && <p className="text-sm leading-[1.3125rem] font-semibold">{airportName(st.name) || st.code}{airportName(st.name) && st.code && <span className="ml-1 text-xs font-normal text-muted-foreground">{st.code}</span>}</p>}
                  {showDates && dateIso && <p className="text-xs leading-[1.125rem] text-muted-foreground">{dayOf(dateIso)}</p>}
                  {st.wait !== undefined && st.wait > 0 && (
                    <span className={cn("mt-1 inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium", risk ? "bg-caution-soft text-caution" : "bg-muted text-ink-soft")}>
                      {st.overnight ? <Moon className="size-3" aria-hidden /> : <Clock className="size-3" aria-hidden />}
                      {risk ?? `${formatDuration(st.wait)} layover`}
                    </span>
                  )}
                </div>
              </li>
              {!isLast && leg && (
                <li className="grid grid-cols-[4rem_1rem_minmax(0,1fr)] gap-x-2">
                  <div className="flex items-center justify-end text-right text-xs text-muted-foreground tabular-nums">{leg.minutes ? formatDuration(leg.minutes) : null}</div>
                  <div className="relative" aria-hidden><span className="absolute inset-y-0 left-[7px] w-0 border-l-2 border-input" /></div>
                  <div className="min-w-0 pb-1">
                    {expandable ? (
                      <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggle(i)} className="-mx-2 flex h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-xl px-2 text-left transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <AirlineMark offer={{ airline: leg.airline ?? "", logo: leg.logo }} className="size-5" />
                        <span className="min-w-0 flex-1 truncate text-sm">{leg.airline}{leg.flightNumber && <>{" "}<span className="text-muted-foreground">{leg.flightNumber}</span></>}</span>
                        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-150", isOpen && "rotate-180")} aria-hidden />
                      </button>
                    ) : (
                      <p className="flex min-h-9 items-center gap-2 text-sm text-ink-soft">
                        {leg.airline ? <AirlineMark offer={{ airline: leg.airline, logo: leg.logo }} className="size-5" /> : <Plane aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
                        <span className="min-w-0 truncate">{leg.airline ?? "Flight"}{leg.flightNumber && <>{" "}<span className={leg.airline ? "text-muted-foreground" : undefined}>{leg.flightNumber}</span></>}</span>
                      </p>
                    )}
                    {leg.oftenDelayed && (
                      <span className="mb-1 inline-flex h-6 items-center gap-1 rounded-full bg-caution-soft px-2 text-xs font-medium text-caution"><Clock className="size-3" aria-hidden />Often over 30 min late</span>
                    )}
                    <AnimatePresence initial={false}>
                      {expandable && isOpen && (
                        <motion.div
                          id={panelId}
                          key="detail"
                          initial={reduce ? false : { height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={reduce ? undefined : { height: 0, opacity: 0 }}
                          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <LegDetail leg={leg} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </li>
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </div>
  );
}
