"use client";

import { useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import type { RouteDay, RouteLegStep } from "@/packages/contracts/route-plan";
import { MODE_COLOR, MODE_ICON } from "@/lib/application/mode-visuals";
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
  const Icon = MODE_ICON[s.mode] ?? MODE_ICON.unknown;
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: MODE_COLOR[s.mode] }} />
      <span className="min-w-0">
        {s.mode === "walk" ? (
          <>Walk {formatDuration(s.minutes)}{s.to ? ` to ${s.to}` : ""}</>
        ) : (
          <>
            {s.line && (
              <span className="mr-1 rounded px-1 py-0.5 text-[10px] font-semibold text-white" style={{ background: s.color ? `#${s.color.replace("#", "")}` : MODE_COLOR[s.mode] }}>
                {s.line}
              </span>
            )}
            {s.headsign ? `toward ${s.headsign}` : s.mode}
            {s.stopCount ? ` · ${s.stopCount} stop${s.stopCount === 1 ? "" : "s"}` : ""} · {formatDuration(s.minutes)}
            {s.from && s.to ? <span className="block text-[11px]">{s.from} → {s.to}</span> : null}
          </>
        )}
      </span>
    </div>
  );
}

function AltChip({ tripId, dayIndex, leg, alt, onChosen }: { tripId: string; dayIndex: number; leg: RouteDay["legs"][number]; alt: RouteDay["legs"][number]["alternatives"][number]; onChosen: () => void }) {
  const [busy, setBusy] = useState(false);
  const Icon = MODE_ICON[alt.mode] ?? MODE_ICON.unknown;
  return (
    <button
      type="button"
      disabled={busy}
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
      className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
    >
      <Icon className="h-3 w-3" style={{ color: MODE_COLOR[alt.mode] }} />
      {formatDuration(alt.minutes)}
    </button>
  );
}

export function RouteTimeline({ day, tripId, onHoverLeg, onLegChosen }: { day: RouteDay; tripId: string; onHoverLeg?: (index: number | null) => void; onLegChosen?: () => void }) {
  const [open, setOpen] = useState<number | null>(null);

  if (day.stops.length < 2) {
    return <p className="text-sm text-muted-foreground">Add at least two stops to this day to see how to get between them.</p>;
  }

  const s = day.summary;
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Day {day.day} · {day.stops.length} stops · ~{formatDuration(s.movingMinutes)} moving
        {s.transitRides ? ` · ${s.transitRides} transit ride${s.transitRides === 1 ? "" : "s"}` : ""}
        {s.fare ? ` · ~${formatMoney(s.fare.amount, s.fare.currency)} fares` : ""}
      </p>

      <ol className="mt-3">
        {day.stops.map((stop, i) => {
          const leg = i < day.legs.length ? day.legs[i] : null;
          const LegIcon = leg ? MODE_ICON[leg.mode] ?? MODE_ICON.unknown : MODE_ICON.unknown;
          return (
            <li key={stop.id}>
              <div className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{i + 1}</span>
                <span className="truncate text-sm font-medium">{stop.name}</span>
                {stop.time && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatClockTime(stop.time)}</span>}
              </div>

              {leg && (
                <div
                  className="my-1 ml-2.5 border-l border-border pl-4"
                  onMouseEnter={() => onHoverLeg?.(i)}
                  onMouseLeave={() => onHoverLeg?.(null)}
                >
                  {leg.kind === "longhaul" ? (
                    <p className="py-1 text-xs text-coral">{leg.note}</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpen(open === i ? null : i)}
                      className="flex w-full items-center gap-2 py-1 text-left text-xs"
                    >
                      <LegIcon className="h-3.5 w-3.5 shrink-0" style={{ color: MODE_COLOR[leg.mode] }} />
                      <span className="font-medium">
                        {leg.minutes != null ? formatDuration(leg.minutes) : "route"}
                        {leg.km != null ? ` · ${leg.km} km` : ""}
                        {time(leg.departure) && time(leg.arrival) ? ` · ${time(leg.departure)}–${time(leg.arrival)}` : ""}
                      </span>
                      {leg.steps.length > 1 && <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open === i && "rotate-180")} />}
                    </button>
                  )}
                  {leg.note && leg.kind === "local" && <p className="pb-1 text-[11px] text-muted-foreground">{leg.note}</p>}
                  {isTimeFitAtRisk(leg.timeFit) && leg.timeFit && (
                    <p className="flex items-center gap-1.5 pb-1 text-[11px] font-medium text-coral">
                      <TriangleAlert className="h-3 w-3 shrink-0" />
                      {leg.timeFit.availableMinutes <= 0
                        ? `No time between these stops for a ${formatDuration(leg.timeFit.neededMinutes)} trip.`
                        : `Only ${formatDuration(leg.timeFit.availableMinutes)} between these stops — this trip takes ~${formatDuration(leg.timeFit.neededMinutes)}.`}
                    </p>
                  )}
                  {leg.kind === "local" && leg.alternatives.length > 0 && (
                    <div className="flex items-center gap-1.5 pb-1.5">
                      <span className="shrink-0 text-[10px] text-muted-foreground">Or:</span>
                      {leg.alternatives.map((alt) => (
                        <AltChip key={alt.mode} tripId={tripId} dayIndex={day.day} leg={leg} alt={alt} onChosen={() => onLegChosen?.()} />
                      ))}
                    </div>
                  )}
                  {open === i && leg.steps.length > 0 && (
                    <div className="space-y-1.5 border-l border-dashed border-border pb-2 pl-3">
                      {leg.steps.map((st, k) => <StepLine key={k} s={st} />)}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
