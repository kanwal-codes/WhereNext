"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Sheet } from "@/components/motion-primitives";
import { useDistance } from "@/components/use-distance";
import { ChevronRight, ExternalLink, Ticket, TriangleAlert } from "lucide-react";
import type { RouteDay, RouteLegStep } from "@/packages/contracts/route-plan";
import { MODE_ICON, MODE_LABEL } from "@/lib/application/mode-visuals";
import { ModeTile, Ribbon, colorOf, legRailStyle, mainMode, mergeWalkSteps } from "@/features/maps/ui/modeParts";
import { FactStrip } from "@/components/DetailKit";
import { formatClockTime } from "@/lib/application/clock-time";
import { isTimeFitAtRisk } from "@/lib/application/time-fit";
import { formatMoney } from "@/lib/currency";
import { cn, formatDuration } from "@/lib/utils";

const time = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

function StepLine({ s }: { s: RouteLegStep }) {
  return (
    <li className="flex items-start gap-2.5 text-xs leading-snug text-muted-foreground">
      <ModeTile mode={s.mode} size="sm" />
      <span className="min-w-0 pt-0.5">
        {s.mode === "walk" ? (
          <>Walk {formatDuration(s.minutes)}{s.to ? ` to ${s.to}` : ""}</>
        ) : (
          <>
            {s.line && (
              <span className="mr-1.5 rounded-md px-1.5 py-0.5 text-2xs font-semibold text-white" style={{ background: s.color ? `#${s.color.replace("#", "")}` : colorOf(s.mode) }}>
                {s.line}
              </span>
            )}
            {s.headsign ? `toward ${s.headsign}` : MODE_LABEL[s.mode]?.toLowerCase() ?? s.mode}
            {s.stopCount ? ` · ${s.stopCount} stop${s.stopCount === 1 ? "" : "s"}` : ""} · {formatDuration(s.minutes)}
            {s.from && s.to ? <span className="mt-0.5 block text-2xs">{s.from} → {s.to}</span> : null}
          </>
        )}
      </span>
    </li>
  );
}

function AltChip({ tripId, dayIndex, leg, alt, onChosen }: { tripId: string; dayIndex: number; leg: RouteDay["legs"][number]; alt: RouteDay["legs"][number]["alternatives"][number]; onChosen: () => void }) {
  const [busy, setBusy] = useState(false);
  const Icon = MODE_ICON[alt.mode] ?? MODE_ICON.unknown;
  const label = MODE_LABEL[alt.mode] ?? alt.mode;
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Go by ${label.toLowerCase()} instead, ${formatDuration(alt.minutes)}`}
      title={`Go by ${label.toLowerCase()} instead`}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          const res = await fetch(`/api/trips/${tripId}/decisions`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              kind: "leg_transport",
              // dayIndex is part of identity, not just metadata — a trip that revisits the same
              // two stops on a later day needs its own choice, not one shared with the first visit.
              value: { fromId: leg.fromId, toId: leg.toId, mode: alt.mode, dayIndex },
              idempotencyKey: `leg:${dayIndex}:${leg.fromId}:${leg.toId}`,
            }),
          });
          if (res.ok) onChosen();
        } finally {
          setBusy(false);
        }
      }}
      className="group/alt inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card pl-2 pr-3 text-xs font-medium tabular-nums text-ink-soft transition-[border-color,background-color,color,transform] duration-150 hover:border-input hover:bg-surface hover:text-foreground active:scale-[0.97] disabled:opacity-50"
    >
      <Icon className="size-3.5 transition-colors" style={{ color: colorOf(alt.mode) }} aria-hidden="true" />
      {formatDuration(alt.minutes)}
    </button>
  );
}

/** What is already booked for the day, above the stops it sits between. The same row as the Plan page's: a ticket, the title, the when, a link to Bookings. */
function BookedList({ booked, tripId, className }: { booked: NonNullable<RouteDay["booked"]>; tripId: string; className?: string }) {
  return (
    <ul aria-label="Booked" className={cn("space-y-2", className)}>
      {booked.map((b, i) => (
        <li key={`${b.title}-${i}`}>
          <Link href={`/trips/${tripId}/bookings`} className="flex min-h-12 items-center gap-3 rounded-2xl bg-muted px-4 py-2.5 text-sm">
            <Ticket className="size-[1.125rem] shrink-0 text-leaf" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium">{b.title}</span>
            {b.detail && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{b.detail}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A leg has something to open when it is more than one piece (a walk, a ride, a walk); a lone walk is already said on the row. */
const hasSteps = (leg: RouteDay["legs"][number]) => mergeWalkSteps(leg.steps).length > 1;

const MAPS_MODE: Record<string, string> = { walk: "walking", drive: "driving", bike: "bicycling" };

export function RouteTimeline({ day, tripId, onHoverLeg, onLegChosen, date }: { day: RouteDay; tripId: string; onHoverLeg?: (index: number | null) => void; onLegChosen?: () => void; date?: string | null }) {
  const distance = useDistance();
  const [open, setOpen] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const hoverLeg = (i: number | null) => {
    setHover(i);
    onHoverLeg?.(i);
  };

  if (day.stops.length < 2) {
    return (
      <div>
        <h2 className="font-display text-title font-medium leading-none tracking-[-0.03em]">
          Day {day.day}
          {date && <span className="ml-2.5 align-[2px] text-base font-normal tracking-[-0.01em] text-ink-soft">{date}</span>}
        </h2>
        {day.booked?.length ? <BookedList booked={day.booked} tripId={tripId} className="mt-4" /> : null}
        {day.stops.map((stop) => (
          <p key={stop.id} className="mt-4 flex items-center gap-3 font-display text-body font-medium leading-snug">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-coral-fill text-xs font-semibold text-white shadow-soft">1</span>
            <span className="min-w-0 flex-1">{stop.name}</span>
            {stop.time && <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">{formatClockTime(stop.time)}</span>}
          </p>
        ))}
        <p className="mt-4 text-sm text-ink-soft">
          {day.stops.length === 1 ? "One more stop on this day and the ways between them show up here." : "Add stops to this day and the ways between them show up here."}
        </p>
        <Link href={`/trips/${tripId}/discover`} className="mt-3 inline-flex h-11 items-center rounded-full bg-muted px-5 text-sm font-semibold transition-transform active:scale-[0.985]">
          Find places to add
        </Link>
      </div>
    );
  }

  const s = day.summary;
  const ribbonParts = day.legs.flatMap((l, i) => (l.steps.length > 0 ? mergeWalkSteps(l.steps).map((st) => ({ mode: st.mode, minutes: st.minutes, group: i })) : [{ mode: l.mode, minutes: l.minutes ?? 0, group: i }]));

  return (
    <div>
      <h2 className="font-display text-title font-medium leading-none tracking-[-0.03em]">
        Day {day.day}
        {date && <span className="ml-2.5 align-[2px] text-base font-normal tracking-[-0.01em] text-ink-soft">{date}</span>}
      </h2>
      {day.booked?.length ? <BookedList booked={day.booked} tripId={tripId} className="mt-4" /> : null}
      <FactStrip
        className="mt-4"
        facts={[
          { label: "On the move", value: formatDuration(s.movingMinutes) },
          { label: "Stops", value: day.stops.length },
          s.transitRides ? { label: "Transit rides", value: s.transitRides, note: s.fare ? `~${formatMoney(s.fare.amount, s.fare.currency)} in fares` : undefined } : false,
        ]}
      />
      {/* A bar of one piece, or only walking, says nothing the numbers above do not. */}
      {ribbonParts.length > 1 && ribbonParts.some((p) => p.mode !== "walk") && <Ribbon className="mt-4" parts={ribbonParts} dim={hover} />}

      <ol className="mt-6">
        {day.stops.map((stop, i) => {
          const leg = i < day.legs.length ? day.legs[i] : null;
          return (
            <motion.li
              key={stop.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.07 * i }}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3"
            >
              <span className="mt-px grid size-7 place-items-center rounded-full bg-coral-fill text-xs font-semibold text-white shadow-soft">{i + 1}</span>
              <div className="flex min-w-0 items-center justify-between gap-3 py-[3px]">
                <span className="line-clamp-2 font-display text-body font-medium leading-snug tracking-[-0.006em]">{stop.name}</span>
                {stop.time && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatClockTime(stop.time)}</span>}
              </div>

              {leg ? (
                <>
                  <div className="flex justify-center py-1.5" aria-hidden="true">
                    <span className="w-1 self-stretch" style={legRailStyle(leg)} />
                  </div>
                  <div
                    className="min-w-0 py-1.5 pb-4"
                    onMouseEnter={() => hoverLeg(i)}
                    onMouseLeave={() => hoverLeg(null)}
                  >
                    {leg.kind === "longhaul" ? (
                      <p className="text-xs leading-snug text-caution">{leg.note}</p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => hasSteps(leg) && setOpen(i)}
                        aria-haspopup={hasSteps(leg) ? "dialog" : undefined}
                        className="group/leg -mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface"
                      >
                        <ModeTile mode={mainMode(leg)} />
                        <span className="min-w-0 flex-1 text-sm leading-tight">
                          <span className="font-semibold tabular-nums">{leg.minutes != null ? formatDuration(leg.minutes) : "Route"}</span>
                          {/* The ride's own departure and arrival times are in its sheet: here they only crowded the row, beside the stops' own times. */}
                          <span className="text-muted-foreground tabular-nums">{leg.km != null ? ` · ${distance(leg.km)}` : ""}</span>
                        </span>
                        {hasSteps(leg) && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      </button>
                    )}
                    {leg.note && leg.kind === "local" && <p className="mt-1 text-2xs leading-snug text-muted-foreground">{leg.note}</p>}
                    {isTimeFitAtRisk(leg.timeFit) && leg.timeFit && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-2xs font-medium leading-snug text-caution">
                        <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden="true" />
                        {leg.timeFit.availableMinutes <= 0
                          ? `No time between these stops for a ${formatDuration(leg.timeFit.neededMinutes)} trip.`
                          : `Only ${formatDuration(leg.timeFit.availableMinutes)} between these stops — this trip takes ~${formatDuration(leg.timeFit.neededMinutes)}.`}
                      </p>
                    )}
                    {leg.kind === "local" && leg.alternatives.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="mr-0.5 text-2xs text-muted-foreground">Or go by</span>
                        {/* One chip per way of travelling: after a switch the old choice comes back as an alternative beside the one the server also offered. */}
                        {leg.alternatives.filter((alt, k, all) => all.findIndex((x) => x.mode === alt.mode) === k).map((alt) => (
                          <AltChip key={alt.mode} tripId={tripId} dayIndex={day.day} leg={leg} alt={alt} onChosen={() => onLegChosen?.()} />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </motion.li>
          );
        })}
      </ol>

      <Sheet open={open != null} onClose={() => setOpen(null)} side="bottom" ariaLabel="Getting between two stops" padded>
        {open != null && day.legs[open] && (
          <>
            <div className="px-1 pb-3 pt-1">
              <p className="font-display text-xl font-medium leading-tight tracking-[-0.02em]">{day.stops[open]?.name} <span className="text-muted-foreground">→</span> {day.stops[open + 1]?.name}</p>
              <p className="mt-1.5 text-sm tabular-nums text-ink-soft">
                {[day.legs[open].minutes != null ? formatDuration(day.legs[open].minutes!) : null, day.legs[open].km != null ? distance(day.legs[open].km!) : null, time(day.legs[open].departure) && time(day.legs[open].arrival) ? `${time(day.legs[open].departure)}–${time(day.legs[open].arrival)}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <ul className="scrollbar-slim min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-1 pb-2 text-sm">
              {mergeWalkSteps(day.legs[open].steps).map((st, k) => <StepLine key={k} s={st} />)}
            </ul>
            <a
              href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(day.stops[open]?.name ?? "")}&destination=${encodeURIComponent(day.stops[open + 1]?.name ?? "")}&travelmode=${MAPS_MODE[mainMode(day.legs[open])] ?? "transit"}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.985]"
            >
              Open in Maps <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </>
        )}
      </Sheet>
    </div>
  );
}
